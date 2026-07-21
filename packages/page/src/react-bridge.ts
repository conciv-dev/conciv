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

function hostElementOf(composite: Fiber): Element | null {
  const host = getNearestHostFiber(composite)
  return host?.stateNode instanceof Element ? host.stateNode : null
}

function ownerOf(f: Fiber, refs: Refs): Owner {
  const el = hostElementOf(f)
  return {component: getDisplayName(f) || '?', ref: el ? addRef(el, refs) : ''}
}

function ownerChain(fiber: Fiber, refs: Refs, limit = 12): Owner[] {
  return getFiberStack(fiber)
    .filter((f: Fiber) => isCompositeFiber(f))
    .slice(0, limit)
    .map((f: Fiber) => ownerOf(f, refs))
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
  const composite = fiber ? composedFiber(fiber) : undefined
  if (!composite) return null
  return hostElementOf(composite) ?? el
}

export function describe(host: Element): {component: string; file: string | null} {
  const fiber = getFiberFromHostInstance(host)
  const composite = fiber ? composedFiber(fiber) : undefined
  const source = sourceFromAttr(host)
  return {component: (composite && getDisplayName(composite)) || '?', file: source ? source.file : null}
}

function classState(composite: Fiber): unknown {
  const inst = composite.stateNode
  return inst && typeof inst.setState === 'function' ? (inst.state ?? null) : null
}

const isClassComponent = (composite: Fiber): boolean =>
  Boolean(composite.stateNode) && typeof composite.stateNode.setState === 'function'

function rectOf(el: Element | null): {x: number; y: number; w: number; h: number} | null {
  const r = el?.getBoundingClientRect()
  return r ? {x: r.x, y: r.y, w: r.width, h: r.height} : null
}

export async function inspect(el: Element): Promise<InspectResult | null> {
  const found = await fiberForEl(el)
  if (!found) return null
  const composite = composedFiber(getLatestFiber(found))
  if (!composite) return null
  return {
    component: getDisplayName(composite) || null,
    props: composite.memoizedProps,
    state: classState(composite),
    hooks: isClassComponent(composite) ? [] : readHooks(composite),
    rect: rectOf(hostElementOf(composite)),
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

function isProviderFiber(f: Fiber): boolean {
  const t = f.type
  if (!t || typeof t !== 'object') return false
  return t.$$typeof === REACT_PROVIDER || t.$$typeof === REACT_CONTEXT || Boolean(t._context)
}

function findProvider(fiber: Fiber): Fiber | null {
  const parent = fiber.return
  if (!parent) return null
  return isProviderFiber(parent) ? parent : findProvider(parent)
}

function overridePropsOn(composite: Fiber, path: (string | number)[], value: unknown): OverrideResult {
  const inst = composite.stateNode
  if (isClassComponent(composite)) {
    composite.pendingProps = copyWithSet(inst.props, path, value)
    inst.forceUpdate()
    return {ok: true}
  }
  const renderer = getRenderer()
  if (!renderer?.overrideProps) return {error: 'React build does not support prop overrides (dev build required)'}
  renderer.overrideProps(composite, path, value)
  return {ok: true}
}

function overrideStateOn(composite: Fiber, path: (string | number)[], value: unknown): OverrideResult {
  if (!isClassComponent(composite))
    return {error: 'state override targets class components; function-component state is a hook; use target=hooks'}
  const inst = composite.stateNode
  if (path.length === 0) inst.state = value
  else setInPlace(inst.state, path, value)
  inst.forceUpdate()
  return {ok: true}
}

function overrideHooksOn(composite: Fiber, path: (string | number)[], value: unknown, hookId?: number): OverrideResult {
  if (hookId === undefined) return {error: 'hooks override requires hookId (from inspect → hooks[].id)'}
  const renderer = getRenderer()
  if (!renderer?.overrideHookState) return {error: 'React build does not support hook overrides (dev build required)'}
  renderer.overrideHookState(composite, hookId, path, value)
  return {ok: true}
}

function overrideContextOn(composite: Fiber, path: (string | number)[], value: unknown): OverrideResult {
  const provider = findProvider(composite)
  if (!provider) return {error: 'no context Provider found above this component'}
  const renderer = getRenderer()
  if (!renderer?.overrideProps) return {error: 'React build does not support overrides (dev build required)'}
  renderer.overrideProps(provider, ['value', ...path], value)
  return {ok: true}
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
  if (target === 'props') return overridePropsOn(composite, path, value)
  if (target === 'state') return overrideStateOn(composite, path, value)
  if (target === 'hooks') return overrideHooksOn(composite, path, value, hookId)
  return overrideContextOn(composite, path, value)
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
  const counters = {count: 0, truncated: 0}
  traverseFiber(rootFiber, (node: Fiber) => {
    if (!isCompositeFiber(node)) return false
    const depth = compositeDepth(depthOf, node)
    depthOf.set(node, depth)
    if (depth > maxDepth || counters.count >= maxNodes) {
      counters.truncated++
      recordTruncation(byFiber, node)
      return false
    }
    counters.count++
    const tn = treeNodeFor(node, refs)
    byFiber.set(node, tn)
    attachTreeNode(byFiber, out, node, tn)
    return false
  })
  return {nodes: out, truncated: counters.truncated}
}

function nearestCompositeAncestor(f: Fiber): Fiber | null {
  if (!f) return null
  return isCompositeFiber(f) ? f : nearestCompositeAncestor(f.return)
}

function compositeDepth(depthOf: Map<Fiber, number>, node: Fiber): number {
  const comp = nearestCompositeAncestor(node.return)
  return comp ? (depthOf.get(comp) ?? 0) + 1 : 0
}

function nearestRecordedAncestor(byFiber: Map<Fiber, TreeNode>, f: Fiber): TreeNode | undefined {
  if (!f) return undefined
  return byFiber.has(f) ? byFiber.get(f) : nearestRecordedAncestor(byFiber, f.return)
}

function recordTruncation(byFiber: Map<Fiber, TreeNode>, node: Fiber): void {
  const anc = nearestRecordedAncestor(byFiber, node.return)
  if (anc) anc.truncated = (anc.truncated ?? 0) + 1
}

function treeNodeFor(node: Fiber, refs: Refs): TreeNode {
  const el = hostElementOf(node)
  return {component: getDisplayName(node) || '?', ref: el ? addRef(el, refs) : '', children: []}
}

function attachTreeNode(byFiber: Map<Fiber, TreeNode>, out: TreeNode[], node: Fiber, tn: TreeNode): void {
  const parentNode = nearestRecordedAncestor(byFiber, node.return)
  if (parentNode) parentNode.children.push(tn)
  else out.push(tn)
}

function knownRootFibers(): Fiber[] {
  const roots: Fiber[] = []
  try {
    for (const r of _fiberRoots as Iterable<{current?: Fiber}>) if (r?.current) roots.push(r.current)
  } catch {}
  return roots
}

const isReactDomKey = (k: string): boolean => k.startsWith('__reactFiber') || k.startsWith('__reactContainer')

function scannedRootFibers(): Fiber[] {
  for (const el of Array.from(document.querySelectorAll('*'))) {
    const key = Object.keys(el).find(isReactDomKey)
    if (!key) continue
    const stack = getFiberStack((el as unknown as Record<string, Fiber>)[key])
    const top = stack[stack.length - 1]
    if (top) return [top]
  }
  return []
}

function reactRootFibers(): Fiber[] {
  const roots = knownRootFibers()
  return roots.length > 0 ? roots : scannedRootFibers()
}

export function rootFibers(): Fiber[] {
  return reactRootFibers()
}

const isNamedComposite = (node: Fiber, name: string): boolean => isCompositeFiber(node) && getDisplayName(node) === name

export function elementByName(name: string): Element | null {
  const found = {el: null as Element | null}
  for (const root of reactRootFibers()) {
    traverseFiber(root, (node: Fiber) => {
      if (found.el || !isNamedComposite(node, name)) return false
      found.el = hostElementOf(node)
      return false
    })
    if (found.el) break
  }
  return found.el
}

export function find(
  name: string,
  refs: Refs,
  limit = 20,
): {matches: {ref: string; component: string}[]; total: number} {
  const matches: {ref: string; component: string}[] = []
  const counter = {total: 0}
  for (const root of reactRootFibers()) {
    traverseFiber(root, (node: Fiber) => {
      const el = isNamedComposite(node, name) ? hostElementOf(node) : null
      if (!el) return false
      counter.total++
      if (matches.length < limit) matches.push({ref: addRef(el, refs), component: name})
      return false
    })
  }
  return {matches, total: counter.total}
}
