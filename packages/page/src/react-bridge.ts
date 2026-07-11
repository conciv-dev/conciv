import {
  getFiberFromHostInstance,
  getFiberStack,
  getDisplayName,
  isCompositeFiber,
  getNearestHostFiber,
  getLatestFiber,
  getRDTHook,
  traverseFiber,
  _fiberRoots,
} from 'bippy'
import {parseStack, hasDebugStack, getFallbackOwnerStack, formatOwnerStack} from 'bippy/source'
import {installTracker} from './render-tracker.js'
import {addRef, type Refs} from './page-snapshot.js'

export type {
  RawFrame,
  SourceLoc,
  Owner,
  Rect,
  TreeNode,
  HookNode,
  LocateResult,
  InspectResult,
  TreeResult,
} from '@conciv/protocol/page-introspect-types'
import type {
  RawFrame,
  SourceLoc,
  Owner,
  TreeNode,
  HookNode,
  LocateResult,
  InspectResult,
  TreeResult,
} from '@conciv/protocol/page-introspect-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bippy fibers are untyped internals
type Fiber = any

type Renderer = {
  overrideProps?: (fiber: Fiber, path: (string | number)[], value: unknown) => void
  overrideHookState?: (fiber: Fiber, id: number, path: (string | number)[], value: unknown) => void
  overrideContext?: (fiber: Fiber, contextType: unknown, path: (string | number)[], value: unknown) => void
}

export function installReactBridge(): void {
  try {
    installTracker()
  } catch {}
}

function getRenderer(): Renderer | null {
  const renderers = (getRDTHook() as {renderers?: Map<number, Renderer>} | undefined)?.renderers
  if (!renderers || renderers.size === 0) return null
  return [...renderers.values()][0] ?? null
}

function readHooks(fiber: Fiber): HookNode[] {
  const types: string[] = Array.isArray(fiber._debugHookTypes) ? fiber._debugHookTypes : []
  const out: HookNode[] = []
  let node = fiber.memoizedState
  let i = 0
  while (node && i < 100) {
    out.push({id: i, name: types[i] ?? 'hook', value: node.memoizedState, editable: !!node.queue})
    node = node.next
    i++
  }
  return out
}

const raf = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))

async function fiberForEl(el: Element, tries = 20): Promise<Fiber | null> {
  for (let i = 0; i < tries; i++) {
    const f = getFiberFromHostInstance(el)
    if (f) return f
    await raf()
  }
  return null
}

function compositeNames(fiber: Fiber): string[] {
  return getFiberStack(fiber)
    .filter((f: Fiber) => isCompositeFiber(f))
    .map((f: Fiber) => getDisplayName(f) || '?')
}

function rawFrames(fiber: Fiber): RawFrame[] {
  const stack = hasDebugStack(fiber) ? fiber._debugStack.stack : getFallbackOwnerStack(fiber)
  return parseStack(formatOwnerStack(stack)).map((fr) => ({
    fileName: fr.fileName,
    line: fr.lineNumber,
    column: fr.columnNumber,
    fn: fr.functionName,
  }))
}

function sourceFromAttr(el: Element): SourceLoc | null {
  const node = el.closest('[data-conciv-source],[data-tsd-source]')
  const raw = node?.getAttribute('data-conciv-source') ?? node?.getAttribute('data-tsd-source')
  if (!raw) return null
  const parts = raw.split(':')
  const column = Number(parts.pop())
  const line = Number(parts.pop())
  const file = parts.join(':')
  return file && Number.isFinite(line) && Number.isFinite(column) ? {file, line, column} : null
}

function ownerChain(fiber: Fiber, refs: Refs, limit = 12): Owner[] {
  const owners: Owner[] = []
  for (const f of getFiberStack(fiber)) {
    if (!isCompositeFiber(f)) continue
    const host = getNearestHostFiber(f)
    const el = host?.stateNode instanceof Element ? host.stateNode : null
    owners.push({component: getDisplayName(f) || '?', ref: el ? addRef(el, refs) : ''})
    if (owners.length >= limit) break
  }
  return owners
}

export async function locate(el: Element, refs: Refs): Promise<LocateResult | null> {
  const fiber = await fiberForEl(el)
  if (!fiber) return null
  const names = compositeNames(fiber)
  const frames = rawFrames(fiber)
  const owners = ownerChain(fiber, refs)
  const source = sourceFromAttr(el)

  return {component: frames[0]?.fn ?? names[0] ?? null, stack: names, frames, owners, ...(source ? {source} : {})}
}

export function componentHostAt(el: Element): Element | null {
  const fiber = getFiberFromHostInstance(el)
  if (!fiber) return null
  const composite = isCompositeFiber(fiber) ? fiber : getFiberStack(fiber).find((f: Fiber) => isCompositeFiber(f))
  if (!composite) return null
  const host = getNearestHostFiber(composite)
  return host?.stateNode instanceof Element ? host.stateNode : el
}

export function describe(host: Element): {component: string; file: string | null} {
  const fiber = getFiberFromHostInstance(host)
  const composite =
    fiber && (isCompositeFiber(fiber) ? fiber : getFiberStack(fiber).find((f: Fiber) => isCompositeFiber(f)))
  const source = sourceFromAttr(host)
  return {component: (composite && getDisplayName(composite)) || '?', file: source ? source.file : null}
}

function classState(composite: Fiber): unknown {
  const inst = composite.stateNode
  return inst && typeof inst.setState === 'function' ? (inst.state ?? null) : null
}

export async function inspect(el: Element): Promise<InspectResult | null> {
  const found = await fiberForEl(el)
  if (!found) return null

  const fiber = getLatestFiber(found)
  const composite = isCompositeFiber(fiber) ? fiber : getFiberStack(fiber).find((f: Fiber) => isCompositeFiber(f))
  if (!composite) return null

  const hooks = composite.stateNode && typeof composite.stateNode.setState === 'function' ? [] : readHooks(composite)
  const host = getNearestHostFiber(composite)
  const hostEl = host?.stateNode instanceof Element ? host.stateNode : null
  const r = hostEl?.getBoundingClientRect()
  return {
    component: getDisplayName(composite) || null,
    props: composite.memoizedProps,
    state: classState(composite),
    hooks,
    rect: r ? {x: r.x, y: r.y, w: r.width, h: r.height} : null,
  }
}

export type OverrideTarget = 'props' | 'state' | 'hooks' | 'context'
export type OverrideResult = {ok: true} | {error: string}

function copyWithSet(obj: unknown, path: (string | number)[], value: unknown): unknown {
  if (path.length === 0) return value
  const [head, ...rest] = path
  const base = (Array.isArray(obj) ? [...obj] : {...(obj as object)}) as Record<string | number, unknown>
  base[head as string] = copyWithSet(base[head as string], rest, value)
  return base
}

function setInPlace(obj: Record<string, unknown>, path: (string | number)[], value: unknown): void {
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i] as string] as Record<string, unknown>
  cur[path[path.length - 1] as string] = value
}

function composedFiber(fiber: Fiber): Fiber | undefined {
  return isCompositeFiber(fiber) ? fiber : getFiberStack(fiber).find((f: Fiber) => isCompositeFiber(f))
}

const REACT_PROVIDER = Symbol.for('react.provider')
const REACT_CONTEXT = Symbol.for('react.context')

function findProvider(fiber: Fiber): Fiber | null {
  let f = fiber.return
  while (f) {
    const t = f.type
    if (t && typeof t === 'object' && (t.$$typeof === REACT_PROVIDER || t.$$typeof === REACT_CONTEXT || t._context)) {
      return f
    }
    f = f.return
  }
  return null
}

export async function override(
  el: Element,
  target: OverrideTarget,
  path: (string | number)[],
  value: unknown,
  hookId?: number,
): Promise<OverrideResult> {
  const found = await fiberForEl(el)
  if (!found) return {error: 'no React fiber for element'}
  const composite = composedFiber(getLatestFiber(found))
  if (!composite) return {error: 'no composite component for element'}
  const inst = composite.stateNode
  const isClass = inst && typeof inst.setState === 'function'
  const renderer = getRenderer()

  if (target === 'props') {
    if (isClass) {
      composite.pendingProps = copyWithSet(inst.props, path, value)
      inst.forceUpdate()
      return {ok: true}
    }
    if (!renderer?.overrideProps) return {error: 'React build does not support prop overrides (dev build required)'}
    renderer.overrideProps(composite, path, value)
    return {ok: true}
  }
  if (target === 'state') {
    if (!isClass)
      return {error: 'state override targets class components; function-component state is a hook — use target=hooks'}
    if (path.length === 0) inst.state = value
    else setInPlace(inst.state, path, value)
    inst.forceUpdate()
    return {ok: true}
  }
  if (target === 'hooks') {
    if (hookId === undefined) return {error: 'hooks override requires hookId (from inspect → hooks[].id)'}
    if (!renderer?.overrideHookState) return {error: 'React build does not support hook overrides (dev build required)'}
    renderer.overrideHookState(composite, hookId, path, value)
    return {ok: true}
  }

  const provider = findProvider(composite)
  if (!provider) return {error: 'no context Provider found above this component'}
  if (!renderer?.overrideProps) return {error: 'React build does not support overrides (dev build required)'}
  renderer.overrideProps(provider, ['value', ...path], value)
  return {ok: true}
}

export async function tree(
  root: Element,
  refs: Refs,
  opts: {maxDepth?: number; maxNodes?: number} = {},
): Promise<TreeResult> {
  const maxDepth = opts.maxDepth ?? 4
  const maxNodes = opts.maxNodes ?? 120
  const rootFiber = await fiberForEl(root)
  if (!rootFiber) return {nodes: [], truncated: 0}
  const out: TreeNode[] = []
  const byFiber = new Map<Fiber, TreeNode>()
  const depthOf = new Map<Fiber, number>()
  let count = 0
  let truncated = 0
  traverseFiber(rootFiber, (node: Fiber) => {
    if (!isCompositeFiber(node)) return false
    let comp = node.return
    while (comp && !isCompositeFiber(comp)) comp = comp.return
    const depth = comp ? (depthOf.get(comp) ?? 0) + 1 : 0
    depthOf.set(node, depth)
    if (depth > maxDepth || count >= maxNodes) {
      truncated++
      let t = node.return
      while (t && !byFiber.has(t)) t = t.return
      const anc = t ? byFiber.get(t) : undefined
      if (anc) anc.truncated = (anc.truncated ?? 0) + 1
      return false
    }
    count++
    const host = getNearestHostFiber(node)
    const el = host?.stateNode instanceof Element ? host.stateNode : null
    const tn: TreeNode = {component: getDisplayName(node) || '?', ref: el ? addRef(el, refs) : '', children: []}
    byFiber.set(node, tn)
    let parent = node.return
    while (parent && !byFiber.has(parent)) parent = parent.return
    const parentNode = parent ? byFiber.get(parent) : undefined
    if (parentNode) parentNode.children.push(tn)
    else out.push(tn)
    return false
  })
  return {nodes: out, truncated}
}

function reactRootFibers(): Fiber[] {
  const roots: Fiber[] = []
  try {
    for (const r of _fiberRoots as Iterable<{current?: Fiber}>) if (r?.current) roots.push(r.current)
  } catch {}
  if (roots.length > 0) return roots
  for (const el of Array.from(document.querySelectorAll('*'))) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'))
    if (!key) continue
    const stack = getFiberStack((el as unknown as Record<string, Fiber>)[key])
    const top = stack[stack.length - 1]
    if (top) return [top]
  }
  return []
}

export function elementByName(name: string): Element | null {
  let result: Element | null = null
  for (const root of reactRootFibers()) {
    traverseFiber(root, (node: Fiber) => {
      if (result) return false
      if (isCompositeFiber(node) && getDisplayName(node) === name) {
        const host = getNearestHostFiber(node)
        if (host?.stateNode instanceof Element) result = host.stateNode
      }
      return false
    })
    if (result) break
  }
  return result
}

export function find(
  name: string,
  refs: Refs,
  limit = 20,
): {matches: {ref: string; component: string}[]; total: number} {
  const matches: {ref: string; component: string}[] = []
  let total = 0
  for (const root of reactRootFibers()) {
    traverseFiber(root, (node: Fiber) => {
      if (isCompositeFiber(node) && getDisplayName(node) === name) {
        const host = getNearestHostFiber(node)
        if (host?.stateNode instanceof Element) {
          total++
          if (matches.length < limit) matches.push({ref: addRef(host.stateNode, refs), component: name})
        }
      }
      return false
    })
  }
  return {matches, total}
}
