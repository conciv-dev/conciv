const REACT_ELEMENT = Symbol.for('react.element')
const REACT_TRANSITIONAL_ELEMENT = Symbol.for('react.transitional.element')

export type DehydrateOptions = {
  maxDepth?: number
  maxItems?: number
  stringCap?: number
  maxNodes?: number

  redact?: RegExp | null
}

export type Collapsed = {__conciv: string; size?: number; preview: string; name?: string}

const DEFAULT_REDACT =
  /pass(word|wd)?|secret|token|api[-_]?key|authorization|bearer|jwt|cookie|credential|private[-_]?key|session/i

const DEFAULTS: Required<Omit<DehydrateOptions, 'redact'>> & {redact: RegExp | null} = {
  maxDepth: 2,
  maxItems: 50,
  stringCap: 200,
  maxNodes: 300,
  redact: DEFAULT_REDACT,
}

export function navigatePath(root: unknown, path: string): {found: boolean; value: unknown} {
  let cur: unknown = root
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return {found: false, value: undefined}
    const obj = cur as Record<string, unknown>
    if (!(seg in obj)) return {found: false, value: undefined}
    cur = obj[seg]
  }
  return {found: true, value: cur}
}

function ctorName(v: object): string {
  try {
    const n = v.constructor?.name
    return typeof n === 'string' && n !== 'Object' ? n : ''
  } catch {
    return ''
  }
}

function reactElementName(el: {type?: unknown}): string {
  const t = el.type
  if (typeof t === 'string') return t
  if (typeof t === 'function') {
    const fn = t as {displayName?: string; name?: string}
    return fn.displayName || fn.name || 'Anonymous'
  }
  if (t && typeof t === 'object') {
    const o = t as {displayName?: string; render?: {name?: string}}
    return o.displayName || o.render?.name || 'Component'
  }
  return 'Element'
}

function isReactElement(v: {$$typeof?: unknown}): boolean {
  return v.$$typeof === REACT_TRANSITIONAL_ELEMENT || v.$$typeof === REACT_ELEMENT
}

function clampStr(s: string, cap: number): string {
  return s.length <= cap ? s : s.slice(0, cap) + '…'
}

type Budget = {nodes: number}

export function dehydrate(value: unknown, options: DehydrateOptions = {}): unknown {
  const opts = {...DEFAULTS, ...options}
  return walk(value, 0, new WeakSet(), {nodes: opts.maxNodes}, opts)
}

function walk(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  budget: Budget,
  opts: Required<Omit<DehydrateOptions, 'redact'>> & {redact: RegExp | null},
): unknown {
  if (value === null) return null
  const t = typeof value
  if (t === 'string') return clampStr(value as string, opts.stringCap)
  if (t === 'boolean') return value
  if (t === 'number') {
    const n = value as number
    if (Number.isNaN(n)) return 'NaN'
    if (!Number.isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity'
    return n
  }
  if (t === 'undefined') return 'undefined'
  if (t === 'bigint') return `${(value as bigint).toString()}n`
  if (t === 'symbol') return (value as symbol).toString()
  if (t === 'function') {
    const fn = value as {name?: string}
    return `ƒ ${fn.name || 'anonymous'}()`
  }

  const obj = value as Record<string, unknown>

  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) {
    const id = value.id ? `#${value.id}` : ''
    return `<${value.tagName.toLowerCase()}${id} />`
  }
  if (isReactElement(obj)) return `<${reactElementName(obj)} />`
  if (value instanceof Date) return value.toISOString()
  if (value instanceof RegExp) return value.toString()
  if (value instanceof Error) return `${value.name}: ${clampStr(value.message, opts.stringCap)}`
  if (value instanceof Promise) return 'Promise {…}'
  if (value instanceof Map) return {__conciv: 'Map', size: value.size, preview: `Map(${value.size})`}
  if (value instanceof Set) return {__conciv: 'Set', size: value.size, preview: `Set(${value.size})`}
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    const name = ctorName(value) || 'ArrayBuffer'
    const size = 'length' in value ? (value as {length: number}).length : (value as ArrayBuffer).byteLength
    return {__conciv: 'binary', size, preview: `${name}(${size})`}
  }

  if (Array.isArray(value)) return walkArray(value, depth, seen, budget, opts)

  const proto = Object.getPrototypeOf(obj)
  const isPlain = proto === Object.prototype || proto === null
  if (!isPlain) {
    const name = ctorName(obj) || 'Object'
    return {__conciv: 'class', name, preview: name, size: countKeys(obj)}
  }
  return walkObject(obj, depth, seen, budget, opts)
}

function countKeys(v: object): number {
  try {
    return Object.keys(v).length
  } catch {
    return 0
  }
}

function walkArray(
  arr: unknown[],
  depth: number,
  seen: WeakSet<object>,
  budget: Budget,
  opts: Required<Omit<DehydrateOptions, 'redact'>> & {redact: RegExp | null},
): unknown {
  if (seen.has(arr)) return '[Circular]'
  if (depth >= opts.maxDepth || budget.nodes <= 0)
    return {__conciv: 'array', size: arr.length, preview: `Array(${arr.length})`}
  seen.add(arr)
  budget.nodes -= 1
  const out: unknown[] = []
  const limit = Math.min(arr.length, opts.maxItems)
  for (let i = 0; i < limit && budget.nodes > 0; i++) out.push(walk(arr[i], depth + 1, seen, budget, opts))
  if (arr.length > limit) out.push(`… +${arr.length - limit} more`)
  seen.delete(arr)
  return out
}

function walkObject(
  obj: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
  budget: Budget,
  opts: Required<Omit<DehydrateOptions, 'redact'>> & {redact: RegExp | null},
): unknown {
  if (seen.has(obj)) return '[Circular]'
  const keys = Object.keys(obj)
  if (depth >= opts.maxDepth || budget.nodes <= 0) return {__conciv: 'object', size: keys.length, preview: '{…}'}
  seen.add(obj)
  budget.nodes -= 1
  const out: Record<string, unknown> = {}
  const limit = Math.min(keys.length, opts.maxItems)
  for (let i = 0; i < limit; i++) {
    if (budget.nodes <= 0) break
    const key = keys[i] as string
    if (opts.redact && opts.redact.test(key)) {
      out[key] = '[redacted]'
      continue
    }
    out[key] = readKey(obj, key, depth, seen, budget, opts)
  }
  if (keys.length > limit) out['…'] = `+${keys.length - limit} more keys`
  seen.delete(obj)
  return out
}

function readKey(
  obj: Record<string, unknown>,
  key: string,
  depth: number,
  seen: WeakSet<object>,
  budget: Budget,
  opts: Required<Omit<DehydrateOptions, 'redact'>> & {redact: RegExp | null},
): unknown {
  try {
    return walk(obj[key], depth + 1, seen, budget, opts)
  } catch {
    return '[getter threw]'
  }
}
