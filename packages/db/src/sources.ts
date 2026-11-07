import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type {NodeSQLiteDatabase} from 'drizzle-orm/node-sqlite'
import type {AnySQLiteColumn} from 'drizzle-orm/sqlite-core'
import {parse, type ASTNode} from '@marcbachmann/cel-js'
import type {Source, SourceField, SourceListing, SourceRead, SourceWrite} from './source-types.js'

export function createSources(input: {orm: NodeSQLiteDatabase; sources: Record<string, Source>}) {
  const {orm, sources} = input

  function sourceOf(name: string): Source {
    const source = sources[name]
    if (source !== undefined) return source
    throw new Error(`no source ${name}; the sources are ${Object.keys(sources).join(', ') || 'none'}`)
  }

  return {
    list: (): SourceListing[] =>
      Object.entries(sources).map(([name, source]) => ({
        name,
        fields: Object.keys(source.fields),
        writable: source.writable === true,
      })),
    read: async (query: SourceRead) => {
      const source = sourceOf(query.from)
      const names = query.select ?? Object.keys(source.fields)
      const fields = Object.fromEntries(names.map((name) => [name, expressionOf({source, name})]))
      const where = query.where === undefined ? undefined : predicate({node: parsed(query.where), source})
      const order = (query.order ?? []).map(({field, dir}) =>
        dir === 'desc' ? desc(expressionOf({source, name: field})) : asc(expressionOf({source, name: field})),
      )
      const selected = orm
        .select(fields)
        .from(source.table)
        .where(where)
        .orderBy(...order)
      const rows = query.limit === undefined ? await selected : await selected.limit(query.limit)
      return rows.map((row): Record<string, unknown> => ({...row}))
    },
    write: async (query: SourceWrite) => {
      const source = sourceOf(query.into)
      if (source.writable !== true) {
        const writable = Object.entries(sources).flatMap(([name, entry]) => (entry.writable === true ? [name] : []))
        throw new Error(`${query.into} is read-only; the writable sources are ${writable.join(', ') || 'none'}`)
      }
      const keys = new Map(Object.entries(getTableColumns(source.table)).map(([key, column]) => [column, key]))
      const row = Object.fromEntries(
        Object.entries(query.values).map(([name, value]) => [keys.get(columnOf({source, name})) ?? name, value]),
      )
      const columns = Object.fromEntries(
        Object.entries(source.fields).flatMap(([name, field]) => ('path' in field ? [] : [[name, field]])),
      )
      const written = await orm.insert(source.table).values(row).returning(columns)
      return written.map((entry): Record<string, unknown> => ({...entry}))
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

function parsed(where: string): ASTNode {
  try {
    return parse(where).ast
  } catch (error) {
    throw new Error(`the where is not CEL: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
  }
}

function fieldOf(input: {source: Source; name: string}): SourceField {
  const field = input.source.fields[input.name]
  if (field !== undefined) return field
  throw new Error(`no field ${input.name}; the fields are ${Object.keys(input.source.fields).join(', ')}`)
}

function expressionOf(input: {source: Source; name: string}): AnySQLiteColumn | SQL {
  const field = fieldOf(input)
  if ('path' in field) return sql`json_extract(${field.column}, ${field.path})`
  return field
}

function columnOf(input: {source: Source; name: string}): AnySQLiteColumn {
  const field = fieldOf(input)
  if (!('path' in field)) return field
  throw new Error(`${input.name} is a path into a JSON column and cannot be written`)
}

function compared(input: {source: Source; name: string}): SQL {
  return sql`${expressionOf(input)}`
}

function bound(value: Literal): Literal {
  if (typeof value === 'boolean') return Number(value)
  return value
}

function predicate(input: {node: ASTNode; source: Source}): SQL {
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

function equality(input: {op: '==' | '!='; left: ASTNode; right: ASTNode; source: Source}): SQL {
  const {field, value} = sides(input)
  if (value === null) return input.op === '==' ? isNull(field) : isNotNull(field)
  return input.op === '==' ? eq(field, value) : ne(field, value)
}

function ordered(input: {op: keyof typeof COMPARISONS; left: ASTNode; right: ASTNode; source: Source}): SQL {
  const {field, value, flipped} = sides(input)
  return COMPARISONS[flipped ? FLIPPED[input.op] : input.op](field, value)
}

function sides(input: {left: ASTNode; right: ASTNode; source: Source}): {
  field: SQL
  value: Literal
  flipped: boolean
} {
  const {left, right, source} = input
  if (left.op === 'id') return {...side({source, name: left.args, value: right}), flipped: false}
  if (right.op === 'id') return {...side({source, name: right.args, value: left}), flipped: true}
  return unsupported(left.op === 'value' || left.op === '-_' ? right : left)
}

function side(input: {source: Source; name: string; value: ASTNode}) {
  const {source, name} = input
  return {field: compared({source, name}), value: bound(literal(input.value))}
}

function membership(input: {field: ASTNode; list: ASTNode; source: Source}): SQL {
  const {field, list, source} = input
  if (field.op !== 'id') return unsupported(field)
  if (list.op !== 'list') return unsupported(list)
  const name = field.args
  return inArray(
    compared({source, name}),
    list.args.map((entry) => bound(literal(entry))),
  )
}

function text(input: {name: string; field: ASTNode; args: ASTNode[]; source: Source}): SQL {
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
