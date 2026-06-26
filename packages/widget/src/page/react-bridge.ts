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

// Page-introspection result types live in @mandarax/protocol; re-exported so widget imports stay put.
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
} from '@mandarax/protocol/page-introspect-types'
import type {
  RawFrame,
  SourceLoc,
  Owner,
  TreeNode,
  HookNode,
  LocateResult,
  InspectResult,
  TreeResult,
} from '@mandarax/protocol/page-introspect-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bippy fibers are untyped internals
type Fiber = any

// React's reconciler attaches these edit methods to the renderer it injects into the global hook
// (dev builds only). bippy's injectOverrideMethods wrapper is unreliable across versions, so we
// read them straight off the renderer.
type Renderer = {
  overrideProps?: (fiber: Fiber, path: (string | number)[], value: unknown) => void
  overrideHookState?: (fiber: Fiber, id: number, path: (string | number)[], value: unknown) => void
  overrideContext?: (fiber: Fiber, contextType: unknown, path: (string | number)[], value: unknown) => void
}

// Install + instrument the React DevTools global hook as early as possible. React connects a
// renderer to this hook only if it exists BEFORE react-dom initializes; without it, hook inspection
// and the reconciler override methods are unavailable. The render tracker owns the single
// `instrument` call (its commit hook is inert until tracking starts). Idempotent.
export function installReactBridge(): void {
  try {
    installTracker()
  } catch {
    // A real DevTools already owns the hook, or a non-browser env — nothing to do.
  }
}

// The first registered renderer (one per React root tree; multi-renderer apps are rare here).
function getRenderer(): Renderer | null {
  const renderers = (getRDTHook() as {renderers?: Map<number, Renderer>} | undefined)?.renderers
  if (!renderers || renderers.size === 0) return null
  return [...renderers.values()][0] ?? null
}

// Read a fiber's hooks straight off its memoizedState linked list, naming them via React's dev-only
// `_debugHookTypes`. The `id` is the positional index — exactly what the reconciler's
// overrideHookState expects. `editable` (has an update queue) marks useState/useReducer. Note:
// hooks that don't occupy a memoizedState node (e.g. useContext) can shift name alignment; value +
// id stay correct, so override is reliable regardless.
function readHooks(fiber: Fiber): HookNode[] {
  const types: string[] = Array.isArray(fiber._debugHookTypes) ? fiber._debugHookTypes : []
  const out: HookNode[] = []
  let node = fiber.memoizedState
  let i = 0
  while (node && i < 100) {
    // Skip non-hook memoizedState (class components store state here, but we only call this for
    // function components). A hook node has `next`/`queue`/`memoizedState` shape.
    out.push({id: i, name: types[i] ?? 'hook', value: node.memoizedState, editable: !!node.queue})
    node = node.next
    i++
  }
  return out
}

const raf = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))

// Fibers attach to DOM nodes only after hydration — retry across frames before giving up.
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

// Raw owner-stack frames (chunk URL + line/col) for the engine to symbolicate. No in-browser resolution.
function rawFrames(fiber: Fiber): RawFrame[] {
  const stack = hasDebugStack(fiber) ? fiber._debugStack.stack : getFallbackOwnerStack(fiber)
  return parseStack(formatOwnerStack(stack)).map((fr) => ({
    fileName: fr.fileName,
    line: fr.lineNumber,
    column: fr.columnNumber,
    fn: fr.functionName,
  }))
}

// A build-injected source attribute on the element (or nearest ancestor that has one). Format is
// "path:line:col"; the path may itself contain ':' (drive letters), so parse the trailing two.
export function sourceFromAttr(el: Element): SourceLoc | null {
  const node = el.closest('[data-mandarax-source],[data-tsd-source]')
  const raw = node?.getAttribute('data-mandarax-source') ?? node?.getAttribute('data-tsd-source')
  if (!raw) return null
  const parts = raw.split(':')
  const column = Number(parts.pop())
  const line = Number(parts.pop())
  const file = parts.join(':')
  return file && Number.isFinite(line) && Number.isFinite(column) ? {file, line, column} : null
}

// The composite ancestor chain as inspectable refs, so the agent can walk up and inspect/edit the
// component that actually owns the bug (capped — a deep tree shouldn't flood the reply).
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
  // The owner-stack top frame names the component that renders the element (e.g. Home/App),
  // unpolluted by framework dev wrappers that show up in the fiber-stack names.
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

// Class component state lives on the instance (stateNode.state); function components have no
// instance — their useState/useReducer values surface in the hooks tree instead.
function classState(composite: Fiber): unknown {
  const inst = composite.stateNode
  return inst && typeof inst.setState === 'function' ? (inst.state ?? null) : null
}

export async function inspect(el: Element): Promise<InspectResult | null> {
  const found = await fiberForEl(el)
  if (!found) return null
  // The host node's stored fiber can be a stale alternate after a re-render — normalize to current.
  const fiber = getLatestFiber(found)
  const composite = isCompositeFiber(fiber) ? fiber : getFiberStack(fiber).find((f: Fiber) => isCompositeFiber(f))
  if (!composite) return null
  // Function-component hooks come off memoizedState; class components have none (state is separate).
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

// Immutable shallow-clone-along-path set (like React DevTools' copyWithSet): used for class props,
// which React reads from a fresh object identity on the next forced render.
function copyWithSet(obj: unknown, path: (string | number)[], value: unknown): unknown {
  if (path.length === 0) return value
  const [head, ...rest] = path
  const base = (Array.isArray(obj) ? [...obj] : {...(obj as object)}) as Record<string | number, unknown>
  base[head as string] = copyWithSet(base[head as string], rest, value)
  return base
}

// In-place set along a path (class state is mutated then force-rendered, matching DevTools).
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

// The nearest context Provider above a fiber. Modern React context isn't editable at the consumer
// (this.context / useContext re-read from the Provider every render), so overriding context means
// overriding the Provider's `value` prop — which DOES propagate to all consumers.
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

// Live-edit a component's props/state/hooks/context. props (function components) + hooks + context
// route through React's reconciler-injected override methods (the same ones React DevTools uses);
// class props/state go through the instance directly. Ephemeral — overwritten on the next real render.
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
  // context: edit the nearest Provider's `value` (the only thing that actually re-flows context to
  // consumers — both useContext and class contextType re-read it each render).
  const provider = findProvider(composite)
  if (!provider) return {error: 'no context Provider found above this component'}
  if (!renderer?.overrideProps) return {error: 'React build does not support overrides (dev build required)'}
  renderer.overrideProps(provider, ['value', ...path], value)
  return {ok: true}
}

// Build a component tree from the root host element's fiber subtree, assigning a ref per component
// (mapped to its nearest host element so the agent can target it with other verbs). Bounded by
// depth + node count so a real app (thousands of fibers) can't flood the agent's context: deeper /
// over-cap components are dropped and counted on their nearest kept ancestor's `truncated`.
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

// Find components by display name. Caps the returned refs (so a name matching hundreds of instances
// can't flood context) while reporting the true total.
// Every mounted React root's top fiber. bippy's _fiberRoots is populated by the commit hook (so it
// covers any container + portals + multiple roots); fall back to scanning the DOM for a fiber if a
// commit hasn't been observed yet.
function reactRootFibers(): Fiber[] {
  const roots: Fiber[] = []
  try {
    for (const r of _fiberRoots as Iterable<{current?: Fiber}>) if (r?.current) roots.push(r.current)
  } catch {
    // _fiberRoots unavailable — fall through to the DOM scan.
  }
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

// The nearest host element of the first component matching `name` — lets element verbs target a
// component directly (inspect --name Composer) without a snapshot → ref round-trip.
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
