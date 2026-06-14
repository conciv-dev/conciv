import {
  getFiberFromHostInstance,
  getFiberStack,
  getDisplayName,
  isCompositeFiber,
  getNearestHostFiber,
  traverseFiber,
} from 'bippy'
import {parseStack, hasDebugStack, getFallbackOwnerStack, formatOwnerStack, getFiberHooks} from 'bippy/source'
import {addRef, type Refs} from './page-snapshot.js'

export type RawFrame = {fileName?: string; line?: number; column?: number; fn?: string}
export type LocateResult = {component: string | null; stack: string[]; frames: RawFrame[]}
export type TreeNode = {component: string; ref: string; children: TreeNode[]}
export type InspectResult = {component: string | null; props: unknown; hooks: unknown}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bippy fibers are untyped internals
type Fiber = any

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

export async function locate(el: Element): Promise<LocateResult | null> {
  const fiber = await fiberForEl(el)
  if (!fiber) return null
  const names = compositeNames(fiber)
  const frames = rawFrames(fiber)
  // The owner-stack top frame names the component that renders the element (e.g. Home/App),
  // unpolluted by framework dev wrappers that show up in the fiber-stack names.
  return {component: frames[0]?.fn ?? names[0] ?? null, stack: names, frames}
}

export async function inspect(el: Element): Promise<InspectResult | null> {
  const fiber = await fiberForEl(el)
  if (!fiber) return null
  const composite = isCompositeFiber(fiber) ? fiber : getFiberStack(fiber).find((f: Fiber) => isCompositeFiber(f))
  if (!composite) return null
  return {component: getDisplayName(composite) || null, props: composite.memoizedProps, hooks: getFiberHooks(composite)}
}

// Build a component tree from the root host element's fiber subtree, assigning a ref per component
// (mapped to its nearest host element so the agent can target it with other verbs).
export async function tree(root: Element, refs: Refs): Promise<TreeNode[]> {
  const rootFiber = await fiberForEl(root)
  if (!rootFiber) return []
  const out: TreeNode[] = []
  const byFiber = new Map<Fiber, TreeNode>()
  traverseFiber(rootFiber, (node: Fiber) => {
    if (!isCompositeFiber(node)) return false
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
  return out
}

export function find(name: string, refs: Refs): {ref: string; component: string}[] {
  const anchor = document.querySelector('#__next, #root, body')
  const start = anchor ? getFiberFromHostInstance(anchor) : null
  if (!start) return []
  const stack = getFiberStack(start)
  const rootFiber = stack[stack.length - 1] ?? start
  const matches: {ref: string; component: string}[] = []
  traverseFiber(rootFiber, (node: Fiber) => {
    if (isCompositeFiber(node) && getDisplayName(node) === name) {
      const host = getNearestHostFiber(node)
      if (host?.stateNode instanceof Element) matches.push({ref: addRef(host.stateNode, refs), component: name})
    }
    return false
  })
  return matches
}
