import {and, eq, getTableName, sql, type SQL} from 'drizzle-orm'
import type {SQLiteTable} from 'drizzle-orm/sqlite-core'
import {z} from 'zod'
import type {openStore} from '../open-store.js'
import {storeTables} from '../store-tables.js'
import {copiedColumns} from './column-check.js'

export function copyRun(input: {tx: Tx; sourcePath: string}): Copied {
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
  if (held !== undefined) return {runId: held.runId, imported: false, copied: {}}
  const columns = copiedColumns({tx, table: runs, own: RUN_OWN})
  const {lastInsertRowid} = tx.run(
    sql`INSERT INTO ${sql.identifier(getTableName(runs))} (${names([...columns, ...RUN_OWN.slice(1)])}) SELECT ${names(columns)}, ${sourcePath}, ${sql.identifier('run_id')} FROM ${sourceTable(runs)}`,
  )
  const runId = Number(lastInsertRowid)
  const children = [targets, rounds, ...Object.values(rest)]
  return {
    runId,
    imported: true,
    copied: Object.fromEntries(children.map((table) => [getTableName(table), copiedRows({tx, table, runId})])),
  }
}

type Tx = Parameters<Parameters<ReturnType<typeof openStore>['orm']['transaction']>[0]>[0]

type Copied = {runId: number; imported: boolean; copied: Record<string, number>}

const {
  runs,
  targets,
  rounds,
  artifacts: _artifacts,
  lanes: _lanes,
  judgements: _judgements,
  reports: _reports,
  ...rest
} = storeTables

const SourceRunsSchema = z.array(z.object({run_id: z.number()}))

const RUN_OWN = ['run_id', 'source_path', 'source_run_id']

const OWN = ['seq', 'run_id']

function copiedRows(input: {tx: Tx; table: SQLiteTable; runId: number}): number {
  const {tx, table, runId} = input
  const columns = copiedColumns({tx, table, own: OWN})
  if (columns.length === 0) return 0
  const {changes} = tx.run(
    sql`INSERT INTO ${sql.identifier(getTableName(table))} (${names(['run_id', ...columns])}) SELECT ${runId}, ${names(columns)} FROM ${sourceTable(table)} ORDER BY ${sql.identifier('rowid')}`,
  )
  return Number(changes)
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
