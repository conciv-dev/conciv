import {createHash} from 'node:crypto'
import {readFileSync, realpathSync} from 'node:fs'
import {isAbsolute, relative, resolve as resolvePath, sep} from 'node:path'
import {parseSync} from 'oxc-parser'

// A source anchor: where a comment's JSX node lives + a content hash that survives line moves. The hash
// folds in the ancestor JSX path so identical leaves under different parents differ. version lets a
// resolver migrate older blobs.
export type Anchor = {
  version: 1
  file: string // project-relative, forward-slashed
  line: number // 1-based
  col: number // 1-based
  component: string
  hash: string // ancestor-path + normalized subtree shape
  snippet: string // capped
  commit?: string
}

export type ResolveResult = {
  status: 'fresh' | 'moved' | 'drifted' | 'orphaned' | 'ambiguous'
  anchor?: Anchor
  candidates?: Anchor[]
  diff?: {before: string; after: string}
}

export type PickedTarget = {file: string; line: number; col: number; commit?: string}

export type AnchorResolver = {
  capture: (target: PickedTarget) => Promise<Anchor>
  resolve: (anchor: Anchor) => Promise<ResolveResult>
  reanchor: (anchor: Anchor, target: PickedTarget) => Promise<Anchor>
}

const SNIPPET_CAP = 2048
// Secrets must never be captured into a snippet/anchor (they flow to the model). Deny by name.
const SECRET_DENYLIST = [/(^|\/)\.env(\.|$)/, /\.pem$/, /(^|\/)id_rsa$/, /\.key$/, /(^|\/)\.npmrc$/]

type JsxNode = {
  type: string
  start: number
  end: number
  openingElement?: {name?: {name?: string; type?: string}; attributes?: {name?: {name?: string}}[]}
  children?: unknown[]
}

// Resolve a target file to an absolute path confined to the project root; reject escapes + secrets.
function confine(projectRoot: string, file: string): string {
  if (file.includes('\0') || file.startsWith('file:')) throw new Error(`illegal path: ${file}`)
  const rootReal = realpathSync(projectRoot)
  const abs = isAbsolute(file) ? file : resolvePath(rootReal, file)
  let real: string
  try {
    real = realpathSync(abs)
  } catch {
    real = abs // not-yet-existing is fine; the containment check below still applies
  }
  const rel = relative(rootReal, real)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`path escapes project root: ${file}`)
  if (SECRET_DENYLIST.some((re) => re.test(rel.split(sep).join('/')))) throw new Error(`secret path denied: ${file}`)
  return real
}

function toRel(projectRoot: string, abs: string): string {
  return relative(realpathSync(projectRoot), abs).split(sep).join('/')
}

// 1-based line/col -> byte offset in source.
function offsetOf(source: string, line: number, col: number): number {
  const lines = source.split('\n')
  let offset = 0
  for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i].length + 1
  return offset + (col - 1)
}

function lineColOf(source: string, offset: number): {line: number; col: number} {
  const upto = source.slice(0, offset).split('\n')
  return {line: upto.length, col: (upto[upto.length - 1]?.length ?? 0) + 1}
}

// Every JSXElement in the program, via a generic walk (oxc returns ESTree-shaped JSX nodes).
function jsxElements(program: unknown): JsxNode[] {
  const out: JsxNode[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const node = n as JsxNode & Record<string, unknown>
    if (node.type === 'JSXElement') out.push(node)
    for (const k of Object.keys(node)) {
      const v = (node as Record<string, unknown>)[k]
      if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') walk(v)
    }
  }
  walk(program)
  return out
}

function tagOf(el: JsxNode): string {
  return el.openingElement?.name?.name ?? 'unknown'
}

// Normalized structural shape of a subtree: tag + sorted attribute names + child element shapes.
// Ignores text, whitespace, and positions so a moved-but-unchanged node hashes identically.
function shapeOf(el: JsxNode): string {
  const attrs = (el.openingElement?.attributes ?? [])
    .map((a) => a.name?.name)
    .filter(Boolean)
    .toSorted()
  const childShapes = (el.children ?? [])
    .filter((c): c is JsxNode => !!c && typeof c === 'object' && (c as JsxNode).type === 'JSXElement')
    .map(shapeOf)
  return `${tagOf(el)}(${attrs.join(',')})[${childShapes.join('')}]`
}

// Hash = ancestor JSX path + this subtree's shape. ancestors is the chain of enclosing tags (outermost
// first), so identical leaves under different parents get different hashes.
function hashOf(ancestors: string[], el: JsxNode): string {
  return createHash('sha256')
    .update(`${ancestors.join('>')}::${shapeOf(el)}`)
    .digest('hex')
    .slice(0, 16)
}

// The innermost JSXElement covering an offset, plus its ancestor tag chain.
function elementAt(elements: JsxNode[], offset: number): {el: JsxNode; ancestors: string[]} | null {
  const covering = elements.filter((e) => e.start <= offset && offset < e.end)
  if (covering.length === 0) return null
  const el = covering.reduce((a, b) => (b.end - b.start < a.end - a.start ? b : a))
  const ancestors = covering.filter((e) => e !== el && e.start <= el.start && e.end >= el.end).map(tagOf)
  return {el, ancestors}
}

// commit-granularity git fallback deferred; the content-hash is the dev-loop workhorse.
function gitCommit(): string | undefined {
  return undefined
}

export function createAnchorResolver(opts: {projectRoot: string}): AnchorResolver {
  const capture = async (target: PickedTarget): Promise<Anchor> => {
    const abs = confine(opts.projectRoot, target.file)
    const source = readFileSync(abs, 'utf8')
    const {program} = parseSync(abs, source)
    const elements = jsxElements(program)
    const found = elementAt(elements, offsetOf(source, target.line, target.col))
    if (!found) throw new Error(`no JSX element at ${target.file}:${target.line}:${target.col}`)
    const {line, col} = lineColOf(source, found.el.start)
    return {
      version: 1,
      file: toRel(opts.projectRoot, abs),
      line,
      col,
      component: tagOf(found.el),
      hash: hashOf(found.ancestors, found.el),
      snippet: source.slice(found.el.start, found.el.end).slice(0, SNIPPET_CAP),
      commit: target.commit ?? gitCommit(),
    }
  }

  const resolve = async (anchor: Anchor): Promise<ResolveResult> => {
    let abs: string
    let source: string
    try {
      abs = confine(opts.projectRoot, anchor.file)
      source = readFileSync(abs, 'utf8')
    } catch {
      return {status: 'orphaned'}
    }
    const {program} = parseSync(abs, source)
    const elements = jsxElements(program)

    // 1. Re-hash at the stored location. Match -> fresh.
    const here = elementAt(elements, offsetOf(source, anchor.line, anchor.col))
    if (here && hashOf(here.ancestors, here.el) === anchor.hash) return {status: 'fresh', anchor}

    // 2. Search the whole file for the hash.
    const matches = elements
      .map((el) => {
        const ancestors = elements.filter((e) => e !== el && e.start <= el.start && e.end >= el.end).map(tagOf)
        return {el, ancestors, hash: hashOf(ancestors, el)}
      })
      .filter((m) => m.hash === anchor.hash)

    const toAnchor = (m: {el: JsxNode}): Anchor => {
      const {line, col} = lineColOf(source, m.el.start)
      return {...anchor, line, col, snippet: source.slice(m.el.start, m.el.end).slice(0, SNIPPET_CAP)}
    }

    if (matches.length === 1) return {status: 'moved', anchor: toAnchor(matches[0])}
    if (matches.length > 1) return {status: 'ambiguous', candidates: matches.map(toAnchor)}

    // 3. Hash gone from the file -> drifted, with a before/after diff for review.
    return {
      status: 'drifted',
      diff: {before: anchor.snippet, after: here ? source.slice(here.el.start, here.el.end).slice(0, SNIPPET_CAP) : ''},
    }
  }

  const reanchor = async (_anchor: Anchor, target: PickedTarget): Promise<Anchor> => capture(target)

  return {capture, resolve, reanchor}
}
