import {DatabaseSync} from 'node:sqlite'

export function readOnlyQuery(input: {file: string; sql: string; prefix?: string}): Record<string, unknown>[] {
  const client = new DatabaseSync(input.file, {readOnly: true})
  try {
    const wrapped = `SELECT * FROM (\n${statementOf(input.sql)}\n)`
    const statement = prepared({client, sql: wrapped})
    if (input.prefix !== undefined) refuseOutside({client, sql: wrapped, prefix: input.prefix})
    return statement.all()
  } finally {
    client.close()
  }
}

const OPENS = new Set(['OpenRead', 'ReopenIdx'])

const SCHEMA_TABLE = 'sqlite_schema'

function statementOf(sql: string): string {
  const trimmed = sql.trim()
  return trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed
}

function prepared(input: {client: DatabaseSync; sql: string}): ReturnType<DatabaseSync['prepare']> {
  try {
    return input.client.prepare(input.sql)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message} (one SELECT or WITH ... SELECT runs here)`, {cause: error})
  }
}

function refuseOutside(input: {client: DatabaseSync; sql: string; prefix: string}): void {
  const {client, prefix} = input
  const roots = new Map(
    client
      .prepare(`SELECT rootpage, tbl_name FROM ${SCHEMA_TABLE}`)
      .all()
      .map((row) => [Number(row.rootpage), String(row.tbl_name)]),
  )
  const read = client
    .prepare(`EXPLAIN ${input.sql}`)
    .all()
    .flatMap((row) => (OPENS.has(String(row.opcode)) ? [roots.get(Number(row.p2)) ?? SCHEMA_TABLE] : []))
  const outside = [...new Set(read.filter((table) => !table.startsWith(prefix)))]
  if (outside.length === 0) return
  throw new Error(`only the ${prefix}* tables are readable here; the statement reads ${outside.join(', ')}`)
}
