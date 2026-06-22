import {readFile} from 'node:fs/promises'
import {parseSync} from 'oxc-parser'
import {confineToRoot, isSecretPath, redactSnippet} from './confine.js'

export type SourceAnchor = {
  file: string
  line: number
  column: number
  component: string | null
  hash: string
  salt: string
  snippet: string
  commit: string | null
}

// The oxc AST is the third-party branded-type boundary; we traverse it as loose records (localized).
type OxcNode = Record<string, unknown>

const asNode = (value: unknown): OxcNode | null =>
  value !== null && typeof value === 'object' ? (value as OxcNode) : null

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null)

const lineColToOffset = (source: string, line: number, column: number): number => {
  const lines = source.split('\n')
  const before = lines.slice(0, Math.max(0, line - 1)).reduce((sum, l) => sum + l.length + 1, 0)
  return before + Math.max(0, column - 1)
}

const offsetToLineCol = (source: string, offset: number): {line: number; column: number} => {
  const before = source.slice(0, offset)
  return {line: before.split('\n').length, column: offset - before.lastIndexOf('\n')}
}

const fnv1a = (input: string): string => {
  const hash = [...input].reduce((acc, ch) => Math.imul(acc ^ ch.charCodeAt(0), 0x01000193), 0x811c9dc5)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const tagOf = (element: OxcNode): string => {
  const opening = asNode(element.openingElement)
  const name = opening ? asNode(opening.name) : null
  return (name ? str(name.name) : null) ?? '?'
}

// A whitespace/attribute-insensitive shape: the element's tag plus the recursive shape of its JSX
// element children. Reindenting or editing attribute values leaves it unchanged; adding or removing a
// nested element changes it.
const structure = (element: OxcNode): string => {
  const children = Array.isArray(element.children) ? element.children : []
  const nested = children
    .map(asNode)
    .filter((c): c is OxcNode => c !== null && c.type === 'JSXElement')
    .map(structure)
  return `${tagOf(element)}(${nested.join(',')})`
}

const componentName = (node: OxcNode): string | null => {
  const id = asNode(node.id)
  const name = id ? str(id.name) : null
  if (node.type === 'FunctionDeclaration' && name && /^[A-Z]/.test(name)) return name
  const init = asNode(node.init)
  if (node.type === 'VariableDeclarator' && name && /^[A-Z]/.test(name) && init)
    if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') return name
  return null
}

type Found = {target: OxcNode; ancestors: string[]; component: string | null; span: number}

const findAt = (program: OxcNode, offset: number): Found | null => {
  let best: Found | null = null
  const visit = (value: unknown, ancestors: string[], component: string | null): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, ancestors, component)
      return
    }
    const node = asNode(value)
    if (!node || typeof node.type !== 'string') return
    const nextComponent = componentName(node) ?? component
    const start = num(node.start)
    const end = num(node.end)
    const covers = node.type === 'JSXElement' && start !== null && end !== null && start <= offset && offset < end
    if (covers && start !== null && end !== null && (!best || end - start < best.span))
      best = {target: node, ancestors: [...ancestors], component: nextComponent, span: end - start}
    const childAncestors = covers ? [...ancestors, tagOf(node)] : ancestors
    for (const key of Object.keys(node)) if (key !== 'type') visit(node[key], childAncestors, nextComponent)
  }
  visit(program, [], null)
  return best
}

export function hashAt(
  source: string,
  line: number,
  column: number,
): {hash: string; salt: string; component: string | null; snippet: string} {
  const parsed = parseSync('anchor.tsx', source)
  const program = asNode(parsed.program)
  const found = program ? findAt(program, lineColToOffset(source, line, column)) : null
  if (!found) return {hash: '', salt: '', component: null, snippet: ''}
  const start = num(found.target.start) ?? 0
  const end = num(found.target.end) ?? 0
  return {
    hash: fnv1a(structure(found.target)),
    salt: fnv1a(found.ancestors.join('>')),
    component: found.component,
    snippet: redactSnippet(source.slice(start, end)),
  }
}

export type ElementFingerprint = {
  line: number
  column: number
  tag: string
  hash: string
  salt: string
  component: string | null
  snippet: string
}

// Every JSX element in the source with its structural fingerprint — the resolver searches these by
// hash to relocate a node that moved within the file.
export function scanElements(source: string): ElementFingerprint[] {
  const parsed = parseSync('anchor.tsx', source)
  const program = asNode(parsed.program)
  if (!program) return []
  const out: ElementFingerprint[] = []
  const visit = (value: unknown, ancestors: string[], component: string | null): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, ancestors, component)
      return
    }
    const node = asNode(value)
    if (!node || typeof node.type !== 'string') return
    const nextComponent = componentName(node) ?? component
    if (node.type === 'JSXElement') {
      const start = num(node.start) ?? 0
      out.push({
        ...offsetToLineCol(source, start),
        tag: tagOf(node),
        hash: fnv1a(structure(node)),
        salt: fnv1a(ancestors.join('>')),
        component: nextComponent,
        snippet: redactSnippet(source.slice(start, num(node.end) ?? start)),
      })
      for (const key of Object.keys(node))
        if (key !== 'type') visit(node[key], [...ancestors, tagOf(node)], nextComponent)
      return
    }
    for (const key of Object.keys(node)) if (key !== 'type') visit(node[key], ancestors, nextComponent)
  }
  visit(program, [], null)
  return out
}

export async function captureSource(opts: {
  root: string
  file: string
  line: number
  column: number
  commit: string | null
}): Promise<SourceAnchor> {
  const abs = await confineToRoot(opts.root, opts.file)
  const source = await readFile(abs, 'utf8')
  const {hash, salt, component, snippet} = hashAt(source, opts.line, opts.column)
  return {
    file: opts.file,
    line: opts.line,
    column: opts.column,
    component,
    hash,
    salt,
    snippet: isSecretPath(opts.file) ? '' : snippet,
    commit: opts.commit,
  }
}
