import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {and, eq, gt, isNotNull, isNull, lt, or, sql, type SQL} from 'drizzle-orm'
import type {NodeSQLiteDatabase} from 'drizzle-orm/node-sqlite'
import {Environment, type ASTNode, type ParseResult} from '@marcbachmann/cel-js'
import {z} from 'zod'
import {narrowing} from './cel-where.js'
import type {
  CatalogDatabase,
  CatalogField,
  CatalogFile,
  CatalogSource,
  SourceOrder,
  SourcePage,
  SourceRead,
  SourceWrite,
} from './source-types.js'

export function catalogSources(input: {orm: NodeSQLiteDatabase; sources: readonly CatalogSource[]}) {
  const {orm} = input
  const sources = [...input.sources]

  function scopeOf(extension: string | undefined): CatalogSource[] {
    if (extension === undefined) return sources
    return sources.filter((source) => source.extension === extension)
  }

  function sourceOf(query: {extension?: string; name: string}): CatalogSource {
    const scoped = scopeOf(query.extension)
    const key = (source: CatalogSource): string => (query.extension === undefined ? source.name : source.source)
    const found = scoped.find((source) => key(source) === query.name)
    if (found !== undefined) return found
    throw new Error(`no source ${query.name}; the sources are ${scoped.map(key).join(', ') || 'none'}`)
  }

  return {
    list: (extension?: string) =>
      scopeOf(extension).map((source) => ({
        name: extension === undefined ? source.name : source.source,
        extension: source.extension,
        source: source.source,
        fields: source.fields.map((field) => field.name),
        writable: source.writable,
        order: source.sort,
      })),
    read: async ({extension, ...query}: SourceRead & {extension?: string}): Promise<SourcePage> =>
      paged({orm, source: sourceOf({extension, name: query.from}), query}),
    write: async ({extension, ...query}: SourceWrite & {extension?: string}) => {
      const source = sourceOf({extension, name: query.into})
      if (!source.writable) {
        const writable = scopeOf(extension).flatMap((entry) =>
          entry.writable ? [extension === undefined ? entry.name : entry.source] : [],
        )
        throw new Error(`${query.into} is read-only; the writable sources are ${writable.join(', ') || 'none'}`)
      }
      const key = source.fields.find((field) => field.key === true)
      if (key !== undefined) return corrected({orm, source, key, into: query.into, values: query.values})
      const entries = Object.entries(query.values).map(([name, value]) => ({field: columnField({source, name}), value}))
      const columns = sql.join(
        entries.map(({field}) => sql.identifier(field.column)),
        sql`, `,
      )
      const values = sql.join(
        entries.map(({field, value}) => sql`${encoded({field, value})}`),
        sql`, `,
      )
      const rows = orm.all<Record<string, unknown>>(
        sql`insert into ${tableOf({orm, source})} (${columns}) values (${values}) returning ${returnedOf(source)}`,
      )
      return rows.map((row) => decoded({source, row}))
    },
  }
}

const cel = new Environment({unlistedVariablesAreDyn: true, homogeneousAggregateLiterals: false})

const CEL_NAMES = ['int', 'uint', 'double', 'bool', 'string', 'bytes', 'list', 'map', 'null_type', 'type', 'dyn']

const MACROS = ['all', 'exists', 'exists_one', 'filter', 'map']

const CursorSchema = z.object({
  order: z.array(z.object({field: z.string(), dir: z.enum(['asc', 'desc'])})),
  after: z.array(z.union([z.string(), z.number(), z.null()])),
  seen: z.int().nonnegative(),
})

type Cursor = z.infer<typeof CursorSchema>

type Key = Cursor['after'][number]

type Matched = {value: unknown; keys: Key[]}

type Lazy = CatalogField & {file: CatalogFile}

async function paged(input: {orm: NodeSQLiteDatabase; source: CatalogSource; query: SourceRead}): Promise<SourcePage> {
  const {orm, source, query} = input
  const plan = planned({source, query})
  const scan = scanner({orm, source, plan})
  const everything = plan.narrowed.residual ? await scan(null, null) : null
  const total = everything?.length ?? counted({orm, table: tableOf({orm, source}), filter: plan.narrowed.filter})
  const seen = plan.cursor?.seen ?? 0
  const after = plan.cursor === null ? null : afterOf({source, order: plan.order, values: plan.cursor.after})
  const bounded = plan.narrowed.residual || query.limit === undefined ? null : seen + query.limit + 1
  const fetched = everything !== null && plan.cursor === null ? everything : await scan(after, bounded)
  return pageOf({fetched, seen, total, limit: query.limit, order: query.order})
}

function planned(input: {source: CatalogSource; query: SourceRead}) {
  const {source, query} = input
  const where = query.where === undefined ? null : expression({source, text: query.where, role: 'where'})
  const select = query.select === undefined ? null : expression({source, text: query.select, role: 'select'})
  if (query.cursor !== undefined && query.order === undefined)
    throw new Error('a cursor takes an order: pass the order the cursor was read with')
  const order = query.order ?? source.sort
  return {
    where,
    select,
    order,
    cursor: query.cursor === undefined ? null : cursorOf({raw: query.cursor, order}),
    touched: source.fields.filter(
      (field): field is Lazy =>
        field.file !== undefined && [where, select].some((entry) => entry?.roots.includes(field.name)),
    ),
    plain: source.fields.filter((field) => field.file === undefined),
    narrowed:
      where === null
        ? {filter: null, residual: false}
        : narrowing({node: where.parsed.ast, resolve: (name) => resolved({source, name})}),
  }
}

function scanner(input: {orm: NodeSQLiteDatabase; source: CatalogSource; plan: ReturnType<typeof planned>}) {
  const {orm, source, plan} = input
  const {where, select, order, touched, plain, narrowed} = plan
  const table = tableOf({orm, source})
  return async (after: SQL | null, limit: number | null): Promise<Matched[]> => {
    const filter = clause(and(...present([narrowed.filter, after])))
    const limited = limit === null ? sql`` : sql` limit ${limit}`
    const rows = orm.all<Record<string, unknown>>(
      sql`select ${selection({source, plain, touched, order})} from ${table}${filter}${sorted({source, order})}${limited}`,
    )
    const contexts = await Promise.all(rows.map((row) => contextOf({source, plain, touched, row})))
    return contexts.flatMap((context, index) => {
      if (narrowed.residual && !matches({where, context})) return []
      const row = rows[index] ?? {}
      return [{value: projected({select, context, plain}), keys: order.map((_, at) => keyOf(row[`order ${at}`]))}]
    })
  }
}

function pageOf(input: {
  fetched: Matched[]
  seen: number
  total: number
  limit: number | undefined
  order: readonly SourceOrder[] | undefined
}): SourcePage {
  const {fetched, seen, total, limit, order} = input
  const kept = fetched.slice(seen)
  const listed = limit === undefined ? kept : kept.slice(0, limit)
  const results = listed.map((entry) => entry.value)
  const last = listed.at(-1)
  if (last === undefined || order === undefined || kept.length === listed.length) return {results, total, next: null}
  const ties = fetched.slice(0, seen + listed.length).filter((entry) => sameKeys(entry.keys, last.keys)).length
  return {
    results,
    total,
    next: Buffer.from(JSON.stringify({order, after: last.keys, seen: ties})).toString('base64url'),
  }
}

function expression(input: {source: CatalogSource; text: string; role: 'where' | 'select'}) {
  const {source, text, role} = input
  const parsed = celOf({text, role})
  const roots = rootsOf(parsed.ast, CEL_NAMES)
  const unknown = roots.find((name) => !source.fields.some((field) => field.name === name))
  if (unknown !== undefined) throw new Error(`no field ${unknown}; the fields are ${fieldNames(source)}`)
  return {parsed, roots}
}

function celOf(input: {text: string; role: 'where' | 'select'}): ParseResult {
  try {
    return cel.parse(input.text)
  } catch (error) {
    throw new Error(`the ${input.role} is not CEL: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

function rootsOf(node: ASTNode, bound: readonly string[]): string[] {
  const within = (child: ASTNode): string[] => rootsOf(child, bound)
  switch (node.op) {
    case 'value':
      return []
    case 'id':
      return bound.includes(node.args) ? [] : [node.args]
    case '.':
    case '.?':
      return within(node.args[0])
    case '!_':
    case '-_':
      return within(node.args)
    case 'call':
      return node.args[1].flatMap(within)
    case 'list':
      return node.args.flatMap(within)
    case 'map':
      return node.args.flatMap((entry) => entry.flatMap(within))
    case 'rcall':
      return macroRoots({name: node.args[0], target: node.args[1], args: node.args[2], bound})
    case '?:':
      return node.args.flatMap(within)
    default:
      return [node.args[0], node.args[1]].flatMap(within)
  }
}

function macroRoots(input: {name: string; target: ASTNode; args: ASTNode[]; bound: readonly string[]}): string[] {
  const {name, target, args, bound} = input
  const [variable, ...body] = args
  const outer = rootsOf(target, bound)
  if (MACROS.includes(name) && variable?.op === 'id')
    return [...outer, ...body.flatMap((child) => rootsOf(child, [...bound, variable.args]))]
  return [...outer, ...args.flatMap((child) => rootsOf(child, bound))]
}

function fieldNames(source: CatalogSource): string {
  return source.fields.map((entry) => entry.name).join(', ')
}

function cursorOf(input: {raw: string; order: readonly SourceOrder[]}): Cursor {
  const parsed = CursorSchema.safeParse(jsonOf(Buffer.from(input.raw, 'base64url').toString('utf8')))
  if (parsed.success && sameOrder(parsed.data.order, input.order)) return parsed.data
  throw new Error('the cursor is not one this query returned: pass the next of a query with the same order')
}

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function sameOrder(left: readonly SourceOrder[], right: readonly SourceOrder[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry.field === right[index]?.field && entry.dir === right[index]?.dir)
  )
}

function sameKeys(left: readonly Key[], right: readonly Key[]): boolean {
  return left.every((value, index) => value === right[index])
}

function keyOf(value: unknown): Key {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  return null
}

function present(entries: readonly (SQL | null)[]): SQL[] {
  return entries.filter((entry): entry is SQL => entry !== null)
}

function clause(filter: SQL | undefined): SQL {
  return filter === undefined ? sql`` : sql` where ${filter}`
}

function selection(input: {
  source: CatalogSource
  plain: readonly CatalogField[]
  touched: readonly Lazy[]
  order: readonly SourceOrder[]
}): SQL {
  const {source, plain, touched, order} = input
  return sql.join(
    [
      ...plain.map((field) => sql`${expressionOf({source, name: field.name})} as ${sql.identifier(field.name)}`),
      ...touched.flatMap((field) => [
        sql`${sql.identifier(field.column)} as ${sql.identifier(`${field.name} path`)}`,
        sql`${sql.identifier(field.file.contentType)} as ${sql.identifier(`${field.name} type`)}`,
      ]),
      ...order.map(({field}, at) => sql`${expressionOf({source, name: field})} as ${sql.identifier(`order ${at}`)}`),
    ],
    sql`, `,
  )
}

function sorted(input: {source: CatalogSource; order: readonly SourceOrder[]}): SQL {
  const order = input.order.map(
    ({field, dir}) =>
      sql`${expressionOf({source: input.source, name: field})} ${dir === 'desc' ? sql`desc` : sql`asc`}`,
  )
  return order.length === 0 ? sql`` : sql` order by ${sql.join(order, sql`, `)}`
}

function counted(input: {orm: NodeSQLiteDatabase; table: SQL; filter: SQL | null}): number {
  const [row] = input.orm.all<{total: number}>(
    sql`select count(*) as total from ${input.table}${clause(input.filter ?? undefined)}`,
  )
  return row?.total ?? 0
}

function afterOf(input: {source: CatalogSource; order: readonly SourceOrder[]; values: readonly Key[]}): SQL | null {
  const {source, order, values} = input
  const column = (field: string): SQL => expressionOf({source, name: field})
  const same = (field: string, value: Key): SQL => (value === null ? isNull(column(field)) : eq(column(field), value))
  const beyond = (entry: SourceOrder, value: Key): SQL | undefined => {
    if (entry.dir === 'asc') return value === null ? isNotNull(column(entry.field)) : gt(column(entry.field), value)
    if (value === null) return sql`0`
    return or(lt(column(entry.field), value), isNull(column(entry.field)))
  }
  const equal = (count: number): SQL[] =>
    order.slice(0, count).map((entry, index) => same(entry.field, values[index] ?? null))
  const branches = order.map((entry, index) => and(...equal(index), beyond(entry, values[index] ?? null)))
  return or(...branches, and(...equal(order.length))) ?? null
}

async function contextOf(input: {
  source: CatalogSource
  plain: readonly CatalogField[]
  touched: readonly Lazy[]
  row: Record<string, unknown>
}): Promise<Record<string, unknown>> {
  const {source, plain, touched, row} = input
  const fields = plain.map((field) => [field.name, decodedValue({type: field.type, value: row[field.name]})])
  const contents = await Promise.all(
    touched.map(async (field) => [
      field.name,
      await contentOf({source, field, path: row[`${field.name} path`], type: row[`${field.name} type`]}),
    ]),
  )
  return Object.fromEntries([...fields, ...contents])
}

async function contentOf(input: {source: CatalogSource; field: Lazy; path: unknown; type: unknown}): Promise<unknown> {
  const {source, field, path, type} = input
  if (typeof path !== 'string') return null
  const kind = String(type ?? '')
    .split(';')[0]
    ?.trim()
  if (kind === undefined || (!isJsonType(kind) && !kind.startsWith('text/')))
    throw new Error(
      `${field.name} of the ${source.name} row at ${path} is ${kind || 'untyped'}, not JSON or text; select ${field.column} instead`,
    )
  const text = await readFile(resolve(field.file.root, path), 'utf8')
  if (isJsonType(kind)) return JSON.parse(text)
  return text
}

function isJsonType(kind: string): boolean {
  return kind === 'application/json' || kind.endsWith('+json')
}

function matches(input: {where: {parsed: ParseResult} | null; context: Record<string, unknown>}): boolean {
  if (input.where === null) return true
  try {
    return input.where.parsed(input.context) === true
  } catch {
    return false
  }
}

function projected(input: {
  select: {parsed: ParseResult} | null
  context: Record<string, unknown>
  plain: readonly CatalogField[]
}): unknown {
  const {select, context, plain} = input
  if (select === null) return Object.fromEntries(plain.map((field) => [field.name, context[field.name]]))
  try {
    return plainValue(select.parsed(context))
  } catch {
    return null
  }
}

function plainValue(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value)
  if (Array.isArray(value)) return value.map(plainValue)
  if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, plainValue(entry)]))
  return value
}

function corrected(input: {
  orm: NodeSQLiteDatabase
  source: CatalogSource
  key: CatalogField
  into: string
  values: Record<string, unknown>
}): Record<string, unknown>[] {
  const {orm, source, key, into, values} = input
  const id = values[key.name]
  if (id === undefined) throw new Error(`${into} takes the ${key.name} to correct`)
  const settable = source.fields.filter((field) => field.schema !== undefined)
  const entries = Object.entries(values)
    .filter(([name]) => name !== key.name)
    .map(([name, value]) => {
      const field = settableField({settable, name, into})
      return {field, value: checked({field, value})}
    })
  if (entries.length === 0)
    throw new Error(`${into} takes at least one of ${settable.map((field) => field.name).join(', ')}`)
  const assignments = sql.join(
    entries.map(({field, value}) => sql`${sql.identifier(field.column)} = ${encoded({field, value})}`),
    sql`, `,
  )
  const rows = orm.all<Record<string, unknown>>(
    sql`update ${tableOf({orm, source})} set ${assignments} where ${sql.identifier(key.column)} = ${id} returning ${returnedOf(source)}`,
  )
  if (rows.length === 0) throw new Error(`no ${key.name} ${String(id)} in ${into}`)
  return rows.map((row) => decoded({source, row}))
}

function settableField(input: {settable: CatalogField[]; name: string; into: string}): CatalogField {
  const {settable, name, into} = input
  const field = settable.find((entry) => entry.name === name)
  if (field !== undefined) return field
  throw new Error(
    `no writable field ${name} in ${into}; the writable fields are ${settable.map((entry) => entry.name).join(', ')}`,
  )
}

function checked(input: {field: CatalogField; value: unknown}): unknown {
  const {field, value} = input
  if (field.schema === undefined) return value
  const result = z.fromJSONSchema(field.schema).safeParse(value)
  if (result.success) return result.data
  throw new Error(`${field.name} is not valid: ${z.prettifyError(result.error)}`)
}

function returnedOf(source: CatalogSource): SQL {
  return sql.join(
    source.fields.flatMap((field) =>
      field.path === null && field.file === undefined
        ? [sql`${sql.identifier(field.column)} as ${sql.identifier(field.name)}`]
        : [],
    ),
    sql`, `,
  )
}

function tableOf(input: {orm: NodeSQLiteDatabase; source: CatalogSource}): SQL {
  const {orm, source} = input
  if (source.database === null) return sql`${sql.identifier(source.table)}`
  mount({orm, database: source.database})
  return sql`${sql.identifier(source.database.name)}.${sql.identifier(source.table)}`
}

function mount(input: {orm: NodeSQLiteDatabase; database: CatalogDatabase}): void {
  const {orm, database} = input
  const held = orm.all<{name: string}>(sql`select name from pragma_database_list`)
  if (held.some((entry) => entry.name === database.name)) return
  if (!existsSync(database.file)) throw new Error(`no ${database.name} database at ${database.file}`)
  orm.run(sql`attach database ${database.file} as ${sql.identifier(database.name)}`)
}

const PATH_SEPARATOR = '.'

function foundField(input: {source: CatalogSource; name: string}): CatalogField | null {
  const field = input.source.fields.find((entry) => entry.name === input.name)
  if (field !== undefined) return field
  const [head = '', ...rest] = input.name.split(PATH_SEPARATOR)
  const parent = input.source.fields.find((entry) => entry.name === head)
  if (parent !== undefined && parent.path === null && isJson(parent.type) && rest.length > 0)
    return {name: input.name, column: parent.column, path: `$.${rest.join(PATH_SEPARATOR)}`, type: 'unknown'}
  return null
}

function fieldOf(input: {source: CatalogSource; name: string}): CatalogField {
  const field = foundField(input)
  if (field !== null) return field
  throw new Error(`no field ${input.name}; the fields are ${fieldNames(input.source)}`)
}

function expressionOf(input: {source: CatalogSource; name: string}): SQL {
  const field = fieldOf(input)
  if (field.file !== undefined) throw new Error(`${input.name} is read from a file; order by ${field.column} instead`)
  return columnOf(field)
}

function resolved(input: {source: CatalogSource; name: string}): SQL | null {
  const field = foundField(input)
  if (field === null || field.file !== undefined) return null
  return columnOf(field)
}

function columnOf(field: CatalogField): SQL {
  if (field.path !== null) return sql`json_extract(${sql.identifier(field.column)}, ${field.path})`
  return sql`${sql.identifier(field.column)}`
}

function columnField(input: {source: CatalogSource; name: string}): CatalogField {
  const field = fieldOf(input)
  if (field.file !== undefined) throw new Error(`${input.name} is read from a file and cannot be written`)
  if (field.path === null) return field
  throw new Error(`${input.name} is a path into a JSON column and cannot be written`)
}

function isJson(type: string): boolean {
  return type.split(' ').includes('json')
}

function decoded(input: {source: CatalogSource; row: Record<string, unknown>}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input.row).map(([name, value]) => [name, decodedValue({type: typeOf({...input, name}), value})]),
  )
}

function typeOf(input: {source: CatalogSource; name: string}): string {
  return input.source.fields.find((field) => field.name === input.name)?.type ?? 'unknown'
}

function decodedValue(input: {type: string; value: unknown}): unknown {
  const {type, value} = input
  if (value === null || value === undefined) return null
  if (type === 'boolean') return Boolean(value)
  if (isJson(type) && typeof value === 'string') return JSON.parse(value)
  return value
}

function encoded(input: {field: CatalogField; value: unknown}): unknown {
  const {field, value} = input
  if (value === null || value === undefined) return null
  if (field.type === 'boolean') return value === true ? 1 : 0
  if (isJson(field.type)) return JSON.stringify(value)
  return value
}
