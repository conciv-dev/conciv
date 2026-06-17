import {parseSync} from 'oxc-parser'
import MagicString from 'magic-string'

// Build-time JSX source injection (dev only): stamp every JSX element with
// `data-aidx-source="<relpath>:<line>:<col>"` so the widget's `locate` can read the exact source
// off the DOM — no fiber/owner-stack symbolication. The owner-stack path remains the universal
// fallback for non-Vite bundlers; this is just a fast/exact path where we control the compile.

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- oxc AST nodes are loosely typed
type Node = any

// Byte-offset → 1-based line/column, via precomputed line starts + binary search.
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

// Collect every JSXOpeningElement in document order by walking the AST generically.
function collectOpenings(node: Node, out: Node[]): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) collectOpenings(child, out)
    return
  }
  if (node.type === 'JSXOpeningElement') out.push(node)
  for (const key in node) {
    if (key === 'type' || key === 'parent') continue
    const v = node[key]
    if (v && typeof v === 'object') collectOpenings(v, out)
  }
}

function hasSourceAttr(node: Node): boolean {
  return (
    Array.isArray(node.attributes) &&
    node.attributes.some(
      (a: Node) => a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier' && a.name.name === 'data-aidx-source',
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
  // Another source-injector (e.g. @tanstack/devtools-vite's data-tsd-source) already ran on this
  // code — re-stamping on the modified source yields wrong offsets and an SSR/client hydration
  // mismatch. `locate` reads their attribute anyway, so there's nothing to add here.
  if (code.includes('data-tsd-source') || code.includes('data-aidx-source')) return null
  const rel = file.startsWith(root) ? file.slice(root.length).replace(/^\//, '') : file
  let parsed: ReturnType<typeof parseSync>
  try {
    parsed = parseSync(file, code, {sourceType: 'module', lang: file.endsWith('.tsx') ? 'tsx' : 'jsx'})
  } catch {
    return null
  }
  if (parsed.errors.length > 0) return null
  const openings: Node[] = []
  collectOpenings(parsed.program, openings)
  if (openings.length === 0) return null

  const loc = makeLocator(code)
  const s = new MagicString(code)
  let changed = false
  for (const node of openings) {
    const name = elementName(node.name)
    if (name === '' || name === 'Fragment' || name === 'React.Fragment') continue
    if (hasSourceAttr(node)) continue
    const {line, column} = loc(node.start)
    // JSON.stringify the value so a path with quotes/specials can't break out of the attribute (XSS-safe).
    const attr = ` data-aidx-source=${JSON.stringify(`${rel}:${line}:${column}`)}`
    s.appendLeft(node.selfClosing ? node.end - 2 : node.end - 1, attr)
    changed = true
  }
  if (!changed) return null
  return {code: s.toString(), map: s.generateMap({source: file, hires: true})}
}
