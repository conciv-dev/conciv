import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {getTableColumns, getTableName} from 'drizzle-orm'
import type {SQLiteTable} from 'drizzle-orm/sqlite-core'
import {uniq} from 'es-toolkit'
import {z} from 'zod'
import {runsTables} from './runs-tables.js'
import type {openRunsStore} from './runs-store.js'

export function loadDumps(input: {client: Client; dir: string}): Record<string, string[]> {
  const {client, dir} = input
  const {targets, ...dumped} = runsTables
  const read = Object.entries(dumped).map(([name, table]) => ({table, rows: dumpOf({dir, name})}))
  const roots = read
    .filter(({table}) => table === runsTables.nodes)
    .flatMap(({rows}) => rows.filter((row) => row.depth === 0))
    .map((row) => ({target_id: row.target_id, width: row.w, height: row.h}))
  if (roots.length === 0) throw new Error(`${dir} has no nodes dump with a root node; the target widths are unknown`)
  return Object.fromEntries(
    [{table: targets, rows: roots}, ...read].flatMap(({table, rows}) => {
      const dropped = sourceOf({client, table, rows})
      return dropped.length === 0 ? [] : [[getTableName(table), dropped]]
    }),
  )
}

type Client = ReturnType<typeof openRunsStore>['orm']['$client']

type Row = Record<string, unknown>

const DumpSchema = z.object({data: z.array(z.record(z.string(), z.unknown()))})

const RENAMED: Record<string, string> = {run: 'run_id', target: 'target_id'}

function dumpOf(input: {dir: string; name: string}): Row[] {
  const file = join(input.dir, `${input.name}.json`)
  if (!existsSync(file)) return []
  return DumpSchema.parse(JSON.parse(readFileSync(file, 'utf8'))).data.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [RENAMED[key] ?? key, value])),
  )
}

function sourceOf(input: {client: Client; table: SQLiteTable; rows: Row[]}): string[] {
  const {client, table, rows} = input
  const held = new Set(Object.values(getTableColumns(table)).map((column) => column.name))
  const columns = uniq(rows.flatMap((row) => Object.keys(row)))
  const kept = columns.filter((name) => held.has(name))
  if (kept.length === 0) return columns
  const name = `source.${quoted(getTableName(table))}`
  client.exec(`CREATE TABLE ${name} (${kept.map(quoted).join(', ')})`)
  const insert = client.prepare(
    `INSERT INTO ${name} (${kept.map(quoted).join(', ')}) VALUES (${kept.map(() => '?').join(', ')})`,
  )
  rows.forEach((row) => insert.run(...kept.map((column) => bound(row[column]))))
  return columns.filter((column) => !held.has(column))
}

function quoted(name: string): string {
  return JSON.stringify(name)
}

function bound(value: unknown): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number' || typeof value === 'string') return value
  return JSON.stringify(value)
}
