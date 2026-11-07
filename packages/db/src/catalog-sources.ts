import {and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql, type SQL} from 'drizzle-orm'
import type {NodeSQLiteDatabase} from 'drizzle-orm/node-sqlite'
import {parse, type ASTNode} from '@marcbachmann/cel-js'
import type {CatalogField, CatalogSource, SourceRead, SourceWrite} from './source-types.js'

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
    read: async ({extension, ...query}: SourceRead & {extension?: string}) => {
      const source = sourceOf({extension, name: query.from})
      const names = query.select ?? source.fields.map((field) => field.name)
      const selected = sql.join(
        names.map((name) => sql`${expressionOf({source, name})} as ${sql.identifier(name)}`),
        sql`, `,
      )
      const where = query.where === undefined ? sql`` : sql` where ${predicate({node: parsed(query.where), source})}`
      const order = (query.order ?? source.sort).map(
        ({field, dir}) => sql`${expressionOf({source, name: field})} ${dir === 'desc' ? sql`desc` : sql`asc`}`,
      )
      const sorted = order.length === 0 ? sql`` : sql` order by ${sql.join(order, sql`, `)}`
      const limited = query.limit === undefined ? sql`` : sql` limit ${query.limit}`
      const rows = orm.all<Record<string, unknown>>(
        sql`select ${selected} from ${sql.identifier(source.table)}${where}${sorted}${limited}`,
      )
      return rows.map((row) => decoded({source, row}))
    },
    write: async ({extension, ...query}: SourceWrite & {extension?: string}) => {
      const source = sourceOf({extension, name: query.into})
      if (!source.writable) {
        const writable = scopeOf(extension).flatMap((entry) =>
          entry.writable ? [extension === undefined ? entry.name : entry.source] : [],
        )
        throw new Error(`${query.into} is read-only; the writable sources are ${writable.join(', ') || 'none'}`)
      }
      const entries = Object.entries(query.values).map(([name, value]) => ({field: columnField({source, name}), value}))
      const columns = sql.join(
        entries.map(({field}) => sql.identifier(field.column)),
        sql`, `,
      )
      const values = sql.join(
        entries.map(({field, value}) => sql`${encoded({field, value})}`),
        sql`, `,
      )
      const returned = sql.join(
        source.fields.flatMap((field) =>
          field.path === null ? [sql`${sql.identifier(field.column)} as ${sql.identifier(field.name)}`] : [],
        ),
        sql`, `,
      )
      const rows = orm.all<Record<string, unknown>>(
        sql`insert into ${sql.identifier(source.table)} (${columns}) values (${values}) returning ${returned}`,
      )
      return rows.map((row) => decoded({source, row}))
    },
  }
}

type Literal = string | number | boolean | null

const SUPPORTED =
  'field names, literals, == != < <= > >=, &&, ||, !, `in` over a list, and contains, startsWith, endsWith on a string'

const COMPARISONS = {
  '<': lt,
  '<=': lte,
  '>': gt,
  '>=': gte,
} as const

const FLIPPED = {'<': '>', '<=': '>=', '>': '<', '>=': '<='} as const

const PATH_SEPARATOR = '.'

function parsed(where: string): ASTNode {
  try {
    return parse(where).ast
  } catch (error) {
    throw new Error(`the where is not CEL: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
  }
}

function fieldOf(input: {source: CatalogSource; name: string}): CatalogField {
  const field = input.source.fields.find((entry) => entry.name === input.name)
  if (field !== undefined) return field
  const [head = '', ...rest] = input.name.split(PATH_SEPARATOR)
  const parent = input.source.fields.find((entry) => entry.name === head)
  if (parent !== undefined && parent.path === null && isJson(parent.type) && rest.length > 0)
    return {name: input.name, column: parent.column, path: `$.${rest.join(PATH_SEPARATOR)}`, type: 'unknown'}
  throw new Error(`no field ${input.name}; the fields are ${input.source.fields.map((entry) => entry.name).join(', ')}`)
}

function expressionOf(input: {source: CatalogSource; name: string}): SQL {
  const field = fieldOf(input)
  if (field.path !== null) return sql`json_extract(${sql.identifier(field.column)}, ${field.path})`
  return sql`${sql.identifier(field.column)}`
}

function columnField(input: {source: CatalogSource; name: string}): CatalogField {
  const field = fieldOf(input)
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
  if (value === null) return null
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

function bound(value: Literal): Literal {
  if (typeof value === 'boolean') return Number(value)
  return value
}

function predicate(input: {node: ASTNode; source: CatalogSource}): SQL {
  const {node, source} = input
  const nested = (child: ASTNode): SQL => predicate({node: child, source})
  switch (node.op) {
    case '&&':
      return and(nested(node.args[0]), nested(node.args[1])) ?? sql`1`
    case '||':
      return or(nested(node.args[0]), nested(node.args[1])) ?? sql`0`
    case '!_':
      return sql`not (${nested(node.args)})`
    case 'id':
      return sql`${expressionOf({source, name: node.args})} = 1`
    case '==':
    case '!=':
      return equality({op: node.op, left: node.args[0], right: node.args[1], source})
    case '<':
    case '<=':
    case '>':
    case '>=':
      return ordered({op: node.op, left: node.args[0], right: node.args[1], source})
    case 'in':
      return membership({field: node.args[0], list: node.args[1], source})
    case 'rcall':
      return text({name: node.args[0], field: node.args[1], args: node.args[2], source})
    default:
      return unsupported(node)
  }
}

function equality(input: {op: '==' | '!='; left: ASTNode; right: ASTNode; source: CatalogSource}): SQL {
  const {field, value} = sides(input)
  if (value === null) return input.op === '==' ? isNull(field) : isNotNull(field)
  return input.op === '==' ? eq(field, value) : ne(field, value)
}

function ordered(input: {op: keyof typeof COMPARISONS; left: ASTNode; right: ASTNode; source: CatalogSource}): SQL {
  const {field, value, flipped} = sides(input)
  return COMPARISONS[flipped ? FLIPPED[input.op] : input.op](field, value)
}

function sides(input: {left: ASTNode; right: ASTNode; source: CatalogSource}): {
  field: SQL
  value: Literal
  flipped: boolean
} {
  const {left, right, source} = input
  if (left.op === 'id') return {...side({source, name: left.args, value: right}), flipped: false}
  if (right.op === 'id') return {...side({source, name: right.args, value: left}), flipped: true}
  return unsupported(left.op === 'value' || left.op === '-_' ? right : left)
}

function side(input: {source: CatalogSource; name: string; value: ASTNode}) {
  const {source, name} = input
  return {field: expressionOf({source, name}), value: bound(literal(input.value))}
}

function membership(input: {field: ASTNode; list: ASTNode; source: CatalogSource}): SQL {
  const {field, list, source} = input
  if (field.op !== 'id') return unsupported(field)
  if (list.op !== 'list') return unsupported(list)
  return inArray(
    expressionOf({source, name: field.args}),
    list.args.map((entry) => bound(literal(entry))),
  )
}

function text(input: {name: string; field: ASTNode; args: ASTNode[]; source: CatalogSource}): SQL {
  const {field, args, source} = input
  const [only] = args
  if (field.op !== 'id' || only === undefined || args.length > 1) return unsupported(field)
  const column = expressionOf({source, name: field.args})
  const value = literal(only)
  if (input.name === 'contains') return sql`instr(${column}, ${value}) > 0`
  if (input.name === 'startsWith') return sql`substr(${column}, 1, length(${value})) = ${value}`
  if (input.name === 'endsWith') return sql`substr(${column}, -length(${value})) = ${value}`
  throw new Error(`unsupported CEL function ${input.name}; supported: ${SUPPORTED}`)
}

function literal(node: ASTNode): Literal {
  if (node.op === '-_') {
    const inner = literal(node.args)
    if (typeof inner === 'number') return -inner
    return unsupported(node)
  }
  if (node.op !== 'value') return unsupported(node)
  const value = node.args
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)
    return value
  return unsupported(node)
}

function unsupported(node: ASTNode): never {
  throw new Error(
    `unsupported CEL node ${node.op} at ${node.input.slice(node.start, node.end)}; supported: ${SUPPORTED}`,
  )
}
