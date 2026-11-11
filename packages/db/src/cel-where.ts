import {and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql, type SQL} from 'drizzle-orm'
import type {ASTNode} from '@marcbachmann/cel-js'

type Resolve = (name: string) => SQL | null

export function narrowing(input: {node: ASTNode; resolve: Resolve}): {filter: SQL | null; residual: boolean} {
  const exact = predicate(input)
  if (exact !== null) return {filter: exact, residual: false}
  const parts = conjuncts(input.node)
    .map((node) => predicate({node, resolve: input.resolve}))
    .filter(isPresent)
  return {filter: and(...parts) ?? null, residual: true}
}

function conjuncts(node: ASTNode): ASTNode[] {
  if (node.op === '&&') return [...conjuncts(node.args[0]), ...conjuncts(node.args[1])]
  return [node]
}

type Literal = string | number | boolean | null

const COMPARISONS = {
  '<': lt,
  '<=': lte,
  '>': gt,
  '>=': gte,
} as const

const FLIPPED = {'<': '>', '<=': '>=', '>': '<', '>=': '<='} as const

function bound(value: Literal): Literal {
  if (typeof value === 'boolean') return Number(value)
  return value
}

function predicate(input: {node: ASTNode; resolve: Resolve}): SQL | null {
  const {node, resolve} = input
  const nested = (child: ASTNode): SQL | null => predicate({node: child, resolve})
  switch (node.op) {
    case '&&':
      return joined({parts: [nested(node.args[0]), nested(node.args[1])], join: and})
    case '||':
      return joined({parts: [nested(node.args[0]), nested(node.args[1])], join: or})
    case '!_':
      return negated(nested(node.args))
    case 'id':
    case '.':
      return truthy(reference({node, resolve}))
    case '==':
    case '!=':
      return equality({op: node.op, left: node.args[0], right: node.args[1], resolve})
    case '<':
    case '<=':
    case '>':
    case '>=':
      return ordered({op: node.op, left: node.args[0], right: node.args[1], resolve})
    case 'in':
      return membership({field: node.args[0], list: node.args[1], resolve})
    case 'rcall':
      return text({name: node.args[0], field: node.args[1], args: node.args[2], resolve})
    default:
      return null
  }
}

function joined(input: {parts: (SQL | null)[]; join: (...parts: SQL[]) => SQL | undefined}): SQL | null {
  const parts = input.parts.filter(isPresent)
  if (parts.length < input.parts.length) return null
  return input.join(...parts) ?? null
}

function negated(inner: SQL | null): SQL | null {
  if (inner === null) return null
  return sql`not (${inner})`
}

function truthy(column: SQL | null): SQL | null {
  if (column === null) return null
  return sql`${column} = 1`
}

function reference(input: {node: ASTNode; resolve: Resolve}): SQL | null {
  const name = nameOf(input.node)
  if (name === null) return null
  return input.resolve(name)
}

function nameOf(node: ASTNode): string | null {
  if (node.op === 'id') return node.args
  if (node.op !== '.') return null
  const parent = nameOf(node.args[0])
  if (parent === null) return null
  return `${parent}.${node.args[1]}`
}

function equality(input: {op: '==' | '!='; left: ASTNode; right: ASTNode; resolve: Resolve}): SQL | null {
  const found = sides(input)
  if (found === null) return null
  const {field, value} = found
  if (value === null) return input.op === '==' ? isNull(field) : isNotNull(field)
  return input.op === '==' ? eq(field, value) : ne(field, value)
}

function ordered(input: {op: keyof typeof COMPARISONS; left: ASTNode; right: ASTNode; resolve: Resolve}): SQL | null {
  const found = sides(input)
  if (found === null || found.value === null) return null
  const {field, value, flipped} = found
  return COMPARISONS[flipped ? FLIPPED[input.op] : input.op](field, value)
}

function sides(input: {
  left: ASTNode
  right: ASTNode
  resolve: Resolve
}): {field: SQL; value: Literal; flipped: boolean} | null {
  const {left, right, resolve} = input
  const forward = side({resolve, field: left, value: right})
  if (forward !== null) return {...forward, flipped: false}
  const backward = side({resolve, field: right, value: left})
  if (backward !== null) return {...backward, flipped: true}
  return null
}

function side(input: {resolve: Resolve; field: ASTNode; value: ASTNode}): {field: SQL; value: Literal} | null {
  const field = reference({node: input.field, resolve: input.resolve})
  const value = literal(input.value)
  if (field === null || value === undefined) return null
  return {field, value: bound(value)}
}

function membership(input: {field: ASTNode; list: ASTNode; resolve: Resolve}): SQL | null {
  const {field, list, resolve} = input
  const column = reference({node: field, resolve})
  if (column === null || list.op !== 'list') return null
  const values = list.args.map(literal)
  const known = values.filter((value): value is Literal => value !== undefined)
  if (known.length < values.length) return null
  return inArray(column, known.map(bound))
}

function text(input: {name: string; field: ASTNode; args: ASTNode[]; resolve: Resolve}): SQL | null {
  const {field, args, resolve} = input
  const [only] = args
  const column = reference({node: field, resolve})
  if (column === null || only === undefined || args.length > 1) return null
  const value = literal(only)
  if (typeof value !== 'string') return null
  if (input.name === 'contains') return sql`instr(${column}, ${value}) > 0`
  if (input.name === 'startsWith') return sql`substr(${column}, 1, length(${value})) = ${value}`
  if (input.name === 'endsWith') return sql`substr(${column}, -length(${value})) = ${value}`
  return null
}

function literal(node: ASTNode): Literal | undefined {
  if (node.op === '-_') {
    const inner = literal(node.args)
    return typeof inner === 'number' ? -inner : undefined
  }
  if (node.op !== 'value') return undefined
  const value = node.args
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)
    return value
  return undefined
}

function isPresent(entry: SQL | null): entry is SQL {
  return entry !== null
}
