import {randomBytes} from 'node:crypto'
import {readFileSync, writeFileSync} from 'node:fs'
import {isAbsolute, relative, sep} from 'node:path'
import {parseSync} from 'oxc-parser'
import MagicString from 'magic-string'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- oxc AST nodes are loosely typed
type Node = any

const SOURCE_ATTR = 'data-conciv-source'
const KEY_ATTR = 'data-conciv-key'
const SITE_ATTR = 'data-conciv-site'
const FRAMEWORK_PACKAGES = ['solid-js', 'react', 'react-dom']
const JSX_EXTENSIONS = ['.jsx', '.tsx']

type Disk = {openings: Node[]; locate: (offset: number) => {line: number; column: number}}

type Stamp = {node: Node; index: number; key: string; served: boolean; fresh: boolean}

type Parsed = {openings: Node[]; imported: Set<string>}

export function addSourceToJsx(input: {
  code: string
  id: string
  root: string
  persist: boolean
}): {code: string; map: ReturnType<MagicString['generateMap']>} | null {
  const {code, id, root} = input
  const file = id.split('?')[0] ?? id
  if (!JSX_EXTENSIONS.some((extension) => file.endsWith(extension))) return null
  if (code.includes('data-tsd-source') || code.includes(SOURCE_ATTR)) return null
  const parsed = parseModule(file, code)
  if (parsed === null || parsed.openings.length === 0) return null
  const {openings, imported} = parsed
  const onDisk = alignedDisk({file, text: readText(file), expected: openings.length})
  const sites = openings.flatMap((node, index) => (calledComponent({node, imported}) ? [{node, index}] : []))
  const stamps = openings.flatMap((node, index): Stamp[] => {
    if (!hostElement(node.name) || attribute({node, name: SOURCE_ATTR}) !== undefined) return []
    if (attribute({node, name: KEY_ATTR}) !== undefined) return [{node, index, key: '', served: false, fresh: false}]
    const kept = literalKey(onDisk?.openings[index])
    return [{node, index, key: kept ?? randomBytes(4).toString('base64url'), served: true, fresh: kept === null}]
  })
  if (stamps.length === 0 && sites.length === 0) return null
  const written = input.persist ? persistKeys({file, root, code, stamps}) : null
  const disk = written === null ? onDisk : alignedDisk({file, text: written, expected: openings.length})
  const rel = inside({file, root}) ? relative(root, file) : file
  const locate = makeLocator(code)
  const s = new MagicString(code)
  stamps.forEach((stamp) => {
    const placed = disk?.openings[stamp.index]
    const {line, column} = placed === undefined || disk === null ? locate(stamp.node.start) : disk.locate(placed.start)
    const source = ` ${SOURCE_ATTR}=${JSON.stringify(`${rel}:${line}:${column}`)}`
    s.appendLeft(insertAt(stamp.node), stamp.served ? `${source}${keyText(stamp.key)}` : source)
  })
  sites.forEach((site) => {
    const placed = disk?.openings[site.index]
    const {line} = placed === undefined || disk === null ? locate(site.node.start) : disk.locate(placed.start)
    s.appendLeft(insertAt(site.node), ` ${SITE_ATTR}=${JSON.stringify(`${rel}:${line}`)}`)
  })
  return {code: s.toString(), map: s.generateMap({source: file, hires: true})}
}

function persistKeys(input: {file: string; root: string; code: string; stamps: Stamp[]}): string | null {
  const fresh = input.stamps.filter((stamp) => stamp.fresh)
  if (fresh.length === 0 || !inside(input) || input.file.split(sep).includes('node_modules')) return null
  const keyed = new MagicString(input.code)
  fresh.forEach((stamp) => keyed.appendLeft(insertAt(stamp.node), keyText(stamp.key)))
  const text = keyed.toString()
  if (readText(input.file) !== input.code) return null
  try {
    writeFileSync(input.file, text)
    return text
  } catch {
    return null
  }
}

function inside(input: {file: string; root: string}): boolean {
  const rel = relative(input.root, input.file)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

function insertAt(node: Node): number {
  const attributes: Node[] = Array.isArray(node.attributes) ? node.attributes : []
  return Math.max(node.name?.end ?? 0, node.typeArguments?.end ?? 0, ...attributes.map((each) => each.end ?? 0))
}

function keyText(key: string): string {
  return ` ${KEY_ATTR}=${JSON.stringify(key)}`
}

function attribute(input: {node: Node; name: string}): Node {
  const attributes: Node[] = Array.isArray(input.node.attributes) ? input.node.attributes : []
  return attributes.find(
    (candidate) =>
      candidate.type === 'JSXAttribute' &&
      candidate.name?.type === 'JSXIdentifier' &&
      candidate.name.name === input.name,
  )
}

function literalKey(node: Node): string | null {
  if (node === undefined) return null
  const value = attribute({node, name: KEY_ATTR})?.value
  return value?.type === 'Literal' && typeof value.value === 'string' && value.value !== '' ? value.value : null
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function alignedDisk(input: {file: string; text: string | null; expected: number}): Disk | null {
  if (input.text === null) return null
  const parsed = parseModule(input.file, input.text)
  if (parsed === null || parsed.openings.length !== input.expected) return null
  return {openings: parsed.openings, locate: makeLocator(input.text)}
}

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

function calledComponent(input: {node: Node; imported: Set<string>}): boolean {
  const {node, imported} = input
  if (hostElement(node.name) || attribute({node, name: SITE_ATTR}) !== undefined) return false
  return imported.has(tagRoot(node.name))
}

function tagRoot(name: Node): string {
  if (name?.type === 'JSXIdentifier') return String(name.name ?? '')
  if (name?.type === 'JSXMemberExpression') return tagRoot(name.object)
  return ''
}

function importedComponents(program: Node): Set<string> {
  const body: Node[] = Array.isArray(program?.body) ? program.body : []
  return new Set(
    body
      .filter(
        (statement) => statement.type === 'ImportDeclaration' && !frameworkPackage(String(statement.source?.value)),
      )
      .flatMap((statement): Node[] => (Array.isArray(statement.specifiers) ? statement.specifiers : []))
      .map((specifier) => String(specifier.local?.name ?? '')),
  )
}

function frameworkPackage(specifier: string): boolean {
  return FRAMEWORK_PACKAGES.some((name) => specifier === name || specifier.startsWith(`${name}/`))
}

function hostElement(name: Node): boolean {
  const first = name?.type === 'JSXIdentifier' ? String(name.name ?? '').charAt(0) : ''
  return first !== first.toUpperCase()
}

function collectOpenings(node: Node, out: Node[]): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) collectOpenings(child, out)
    return
  }
  if (node.type === 'JSXElement') out.push(node.openingElement)
  for (const key in node) {
    if (key === 'type' || key === 'parent') continue
    const v = node[key]
    if (v && typeof v === 'object') collectOpenings(v, out)
  }
}

function parseModule(file: string, code: string): Parsed | null {
  let parsed: ReturnType<typeof parseSync>
  try {
    parsed = parseSync(file, code, {sourceType: 'module', lang: file.endsWith('.tsx') ? 'tsx' : 'jsx'})
  } catch {
    return null
  }
  if (parsed.errors.length > 0) return null
  const openings: Node[] = []
  collectOpenings(parsed.program, openings)
  return {openings, imported: importedComponents(parsed.program)}
}
