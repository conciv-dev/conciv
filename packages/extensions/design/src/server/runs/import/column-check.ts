import {getTableName, sql} from 'drizzle-orm'
import type {SQLiteTable} from 'drizzle-orm/sqlite-core'
import {z} from 'zod'
import type {openStore} from '../open-store.js'

export function copiedColumns(input: {tx: Tx; table: SQLiteTable; own: readonly string[]}): string[] {
  const {tx, table, own} = input
  const name = getTableName(table)
  const live = columnsIn({tx, name, schema: 'source'})
  const stored = columnsIn({tx, name, schema: 'main'})
  const lacking = live.filter((column) => !stored.includes(column))
  if (lacking.length > 0)
    throw new Error(
      `the runs store lacks ${lacking.map((column) => `${name}.${column}`).join(', ')}; a runs migration is missing`,
    )
  return live.filter((column) => !own.includes(column))
}

type Tx = Parameters<Parameters<ReturnType<typeof openStore>['orm']['transaction']>[0]>[0]

const NamesSchema = z.array(z.object({name: z.string()}))

function columnsIn(input: {tx: Tx; name: string; schema: string}): string[] {
  return NamesSchema.parse(
    input.tx.all(sql`SELECT ${sql.identifier('name')} FROM pragma_table_info(${input.name}, ${input.schema})`),
  ).map((entry) => entry.name)
}
