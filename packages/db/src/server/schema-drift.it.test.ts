import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {mkdtempSync, readdirSync} from 'node:fs'
import {DatabaseSync} from 'node:sqlite'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {z} from 'zod'
import {ensureTrailBinary, startTrailBase} from './index.js'
import {DraftRowSchema, MarkerRowSchema, SessionRowSchema} from '../rows.js'

const SCHEMAS = {sessions: SessionRowSchema, drafts: DraftRowSchema, markers: MarkerRowSchema}

const PragmaColumnSchema = z.object({name: z.string(), notnull: z.number()})

let dataDir: string

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'schema-drift-'))
  const binary = await ensureTrailBinary({cacheDir: join(homedir(), '.cache/conciv/trailbase')})
  const server = await startTrailBase({binary, dataDir, port: await getPort(), dev: true})
  await server.stop()
}, 120000)

afterAll(() => {})

function sqliteFile(): string {
  const files = readdirSync(dataDir, {recursive: true, encoding: 'utf8'})
  const found = files.find((file) => file.endsWith('main.db'))
  if (!found) throw new Error(`no main.db under ${dataDir}: ${files.join(', ')}`)
  return join(dataDir, found)
}

function tableColumns(table: string): Array<z.infer<typeof PragmaColumnSchema>> {
  const database = new DatabaseSync(sqliteFile(), {readOnly: true})
  const rows = database.prepare(`PRAGMA table_info(${table})`).all()
  database.close()
  return rows.map((row) => PragmaColumnSchema.parse(row))
}

describe('zod schemas match the real sqlite schema', () => {
  for (const [table, schema] of Object.entries(SCHEMAS)) {
    it(`pins ${table}`, () => {
      const columns = tableColumns(table)
      const dbNames = columns.map((column) => column.name).toSorted()
      const zodNames = Object.keys(schema.shape).toSorted()
      expect(dbNames).toEqual(zodNames)
      const fields: Record<string, z.ZodType | undefined> = schema.shape
      for (const column of columns) {
        const field = fields[column.name]
        if (!field) throw new Error(`no zod field for ${table}.${column.name}`)
        const acceptsNull = field.safeParse(null).success
        expect({column: `${table}.${column.name}`, acceptsNull}).toEqual({
          column: `${table}.${column.name}`,
          acceptsNull: column.notnull === 0,
        })
      }
    })
  }
})
