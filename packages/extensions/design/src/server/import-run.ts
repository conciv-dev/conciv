import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {and, eq, getTableColumns, getTableName, sql, type SQL} from 'drizzle-orm'
import type {SQLiteTable} from 'drizzle-orm/sqlite-core'
import {z} from 'zod'
import {dbFile} from '@conciv/db'
import {runsTables} from './runs-tables.js'
import type {openRunsStore} from './runs-store.js'

export function importRun(input: {runsStore: RunsStore; stateDir: string}): Imported {
  const {orm} = input.runsStore
  const sourcePath = resolve(input.stateDir)
  const {path} = dbFile(sourcePath)
  const mode = existsSync(`${path}-wal`) ? 'mode=ro' : 'immutable=1'
  orm.$client.prepare('ATTACH DATABASE ? AS source').run(`${pathToFileURL(path).href}?${mode}`)
  try {
    return orm.transaction((tx) => copied({tx, sourcePath}), {behavior: 'immediate'})
  } finally {
    orm.$client.exec('DETACH DATABASE source')
  }
}

type RunsStore = ReturnType<typeof openRunsStore>

type Tx = Parameters<Parameters<RunsStore['orm']['transaction']>[0]>[0]

type Imported = {runId: number; sourceRunId: number; imported: boolean; copied: Record<string, number>}

const {runs, targets, rounds, ...children} = runsTables

const SourceRunsSchema = z.array(z.object({run_id: z.number()}))

const NamesSchema = z.array(z.object({name: z.string()}))

function copied(input: {tx: Tx; sourcePath: string}): Imported {
  const {tx, sourcePath} = input
  const [source, ...others] = SourceRunsSchema.parse(
    tx.all(sql`SELECT ${sql.identifier('run_id')} FROM ${sourceTable(runs)}`),
  )
  if (source === undefined || others.length > 0)
    throw new Error(`${sourcePath} holds ${others.length + (source === undefined ? 0 : 1)} runs; one is imported`)
  const sourceRunId = source.run_id
  const [held] = tx
    .select({runId: runs.run_id})
    .from(runs)
    .where(and(eq(runs.source_path, sourcePath), eq(runs.source_run_id, sourceRunId)))
    .all()
  if (held !== undefined) return {runId: held.runId, sourceRunId, imported: false, copied: {}}
  const shared = sharedColumns({tx, table: runs}).filter((name) => !RUN_OWN.includes(name))
  const {lastInsertRowid} = tx.run(
    sql`INSERT INTO ${sql.identifier(getTableName(runs))} (${names([...shared, ...RUN_OWN.slice(1)])}) SELECT ${names(shared)}, ${sourcePath}, ${sql.identifier('run_id')} FROM ${sourceTable(runs)}`,
  )
  const runId = Number(lastInsertRowid)
  const tables = [targets, rounds, ...Object.values(children)]
  return {
    runId,
    sourceRunId,
    imported: true,
    copied: Object.fromEntries(tables.map((table) => [getTableName(table), copiedRows({tx, table, runId})])),
  }
}

const RUN_OWN = ['run_id', 'source_path', 'source_run_id']

const OWN = ['seq', 'run_id']

function copiedRows(input: {tx: Tx; table: SQLiteTable; runId: number}): number {
  const {tx, table, runId} = input
  const shared = sharedColumns({tx, table}).filter((name) => !OWN.includes(name))
  if (shared.length === 0) return 0
  const {changes} = tx.run(
    sql`INSERT INTO ${sql.identifier(getTableName(table))} (${names(['run_id', ...shared])}) SELECT ${runId}, ${names(shared)} FROM ${sourceTable(table)} ORDER BY ${sql.identifier('rowid')}`,
  )
  return Number(changes)
}

function sharedColumns(input: {tx: Tx; table: SQLiteTable}): string[] {
  const held = new Set(
    NamesSchema.parse(
      input.tx.all(
        sql`SELECT ${sql.identifier('name')} FROM pragma_table_info(${getTableName(input.table)}, 'source')`,
      ),
    ).map((entry) => entry.name),
  )
  return Object.values(getTableColumns(input.table))
    .map((column) => column.name)
    .filter((name) => held.has(name))
}

function sourceTable(table: SQLiteTable): SQL {
  return sql`${sql.identifier('source')}.${sql.identifier(getTableName(table))}`
}

function names(columns: string[]): SQL {
  return sql.join(
    columns.map((name) => sql.identifier(name)),
    sql`, `,
  )
}
