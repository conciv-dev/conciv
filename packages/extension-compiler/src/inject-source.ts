import {readFileSync} from 'node:fs'
import {parseSync} from 'oxc-parser'
import MagicString from 'magic-string'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- oxc AST nodes are loosely typed
type Node = any

function makeLocator(code: string): (offset: number) => {line: number; column: number} {
  const starts = [0]
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') starts.push(i + 1)
  return (offset) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if ((starts[mid] ?? 0) <= offset) lo = mid
      else hi = mid - 1
    }
    return {line: lo + 1, column: offset - (starts[lo] ?? 0) + 1}
  }
}

function elementName(name: Node): string {
  if (!name) return ''
  if (name.type === 'JSXIdentifier') return name.name ?? ''
  if (name.type === 'JSXMemberExpression') return `${elementName(name.object)}.${name.property?.name ?? ''}`
  if (name.type === 'JSXNamespacedName') return `${name.namespace?.name}:${name.name?.name}`
  return name.name ?? ''
}

type Opening = {node: Node; children: Node[]; scope: string}

const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression'])

function scopeName(node: Node, scope: string): string {
  return declaredName(node) || scope
}

function declaredName(node: Node): string {
  switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      return identifierName(node.id)
    case 'VariableDeclarator':
      return FUNCTION_TYPES.has(node.init?.type) ? identifierName(node.id) : ''
    case 'MethodDefinition':
      return identifierName(node.key)
    default:
      return ''
  }
}

function identifierName(node: Node): string {
  return node?.type === 'Identifier' ? node.name : ''
}

function collectOpenings(node: Node, scope: string, out: Opening[]): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) collectOpenings(child, scope, out)
    return
  }
  const inner = scopeName(node, scope)
  if (node.type === 'JSXElement') out.push({node: node.openingElement, children: node.children, scope: inner})
  for (const key in node) {
    if (key === 'type' || key === 'parent') continue
    const v = node[key]
    if (v && typeof v === 'object') collectOpenings(v, inner, out)
  }
}

function parseOpenings(file: string, code: string): Opening[] | null {
  let parsed: ReturnType<typeof parseSync>
  try {
    parsed = parseSync(file, code, {sourceType: 'module', lang: file.endsWith('.tsx') ? 'tsx' : 'jsx'})
  } catch {
    return null
  }
  if (parsed.errors.length > 0) return null
  const openings: Opening[] = []
  collectOpenings(parsed.program, '', openings)
  return openings
}

function diskPositions(file: string, expected: number): {line: number; column: number}[] | null {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const openings = parseOpenings(file, raw)
  if (!openings || openings.length !== expected) return null
  const loc = makeLocator(raw)
  return openings.map((opening) => loc(opening.node.start))
}

function hasSourceAttr(node: Node): boolean {
  return (
    Array.isArray(node.attributes) &&
    node.attributes.some(
      (a: Node) =>
        a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier' && a.name.name === 'data-conciv-source',
    )
  )
}

export function addSourceToJsx(
  code: string,
  id: string,
  root: string,
): {code: string; map: ReturnType<MagicString['generateMap']>} | null {
  const file = id.split('?')[0] ?? id
  if (!/\.[jt]sx$/.test(file)) return null

  if (code.includes('data-tsd-source') || code.includes('data-conciv-source')) return null
  const rel = file.startsWith(root) ? file.slice(root.length).replace(/^\//, '') : file
  const openings = parseOpenings(file, code)
  if (!openings || openings.length === 0) return null

  const diskLocs = diskPositions(file, openings.length)
  const loc = makeLocator(code)
  const s = new MagicString(code)
  const seen = new Map<string, number>()
  let changed = false
  for (const [i, opening] of openings.entries()) {
    const {node} = opening
    const name = elementName(node.name)
    if (name === '' || name === 'Fragment' || name === 'React.Fragment') continue
    if (hasSourceAttr(node)) continue
    const {line, column} = diskLocs ? (diskLocs[i] ?? loc(node.start)) : loc(node.start)
    const key = elementKey({rel, name, opening, seen})

    const attr = ` data-conciv-source=${JSON.stringify(`${rel}:${line}:${column}`)} data-conciv-key=${JSON.stringify(key)}`
    s.appendLeft(node.selfClosing ? node.end - 2 : node.end - 1, attr)
    changed = true
  }
  if (!changed) return null
  return {code: s.toString(), map: s.generateMap({source: file, hires: true})}
}

function elementKey(input: {rel: string; name: string; opening: Opening; seen: Map<string, number>}): string {
  const {opening, seen} = input
  const hash = fnv1a(
    [input.rel, opening.scope, input.name, staticClass(opening.node), staticText(opening.children)].join('|'),
  )
  const ordinal = seen.get(hash) ?? 0
  seen.set(hash, ordinal + 1)
  return ordinal === 0 ? hash : `${hash}.${ordinal}`
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (const character of text) hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 0x01000193) >>> 0
  return hash.toString(16).padStart(8, '0')
}

function staticClass(node: Node): string {
  const attribute = (Array.isArray(node.attributes) ? node.attributes : []).find(
    (a: Node) =>
      a.type === 'JSXAttribute' &&
      a.name?.type === 'JSXIdentifier' &&
      (a.name.name === 'className' || a.name.name === 'class'),
  )
  const value = attribute?.value
  return value?.type === 'Literal' && typeof value.value === 'string' ? value.value : ''
}

function staticText(children: Node[]): string {
  return children
    .filter((child) => child?.type === 'JSXText' && typeof child.value === 'string')
    .map((child) => folded(child.value))
    .filter((text) => text !== '')
    .join(' ')
}

function folded(text: string): string {
  return [...text]
    .map((character) => (character.trim() === '' ? ' ' : character))
    .join('')
    .split(' ')
    .filter((word) => word !== '')
    .join(' ')
}
