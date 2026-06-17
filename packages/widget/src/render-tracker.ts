// Render tracking: how many times each component re-rendered, why, and (when a profiling build
// makes timings available) how long. One commit hook, installed once at startup but inert until a
// `track start` flips the flag — so it costs a flag-check per commit when idle, and only walks the
// rendered subtree while actively tracking.
import {instrument, traverseRenderedFibers, getFiberId, getDisplayName, isCompositeFiber, getTimings} from 'bippy'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bippy fibers are untyped internals
type Fiber = any

type Stat = {component: string; renders: number; lastReason: string; changedProps: string[]; selfTimeMaxMs: number}

export type TrackReport = {
  tracking: boolean
  tracked: number
  // React only records render durations under a profiling build / <Profiler>; false ⇒ timings omitted.
  timingsAvailable: boolean
  components: Array<{
    component: string
    renders: number
    lastReason: string
    changedProps?: string[]
    selfTimeMaxMs?: number
  }>
  note?: string
}

const state = {tracking: false, installed: false, stats: new Map<number, Stat>()}

// Shallow-diff a fiber's props against its previous render to name what changed.
function changedProps(fiber: Fiber): string[] {
  const next = fiber.memoizedProps
  const prev = fiber.alternate?.memoizedProps
  if (!prev || !next || typeof next !== 'object' || typeof prev !== 'object') return []
  const out: string[] = []
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) if (prev[k] !== next[k]) out.push(k)
  return out
}

// Runs synchronously inside each commit. Cheap no-op until tracking is on. The prop diff MUST be
// synchronous here — `alternate` is the correct previous render only at commit time.
function onCommit(_rendererID: number, root: Fiber): void {
  if (!state.tracking) return
  traverseRenderedFibers(root, (fiber: Fiber) => {
    if (!isCompositeFiber(fiber)) return
    const id = getFiberId(fiber)
    const prior = state.stats.get(id)
    const cur: Stat = prior ?? {
      component: getDisplayName(fiber) || '?',
      renders: 0,
      lastReason: '',
      changedProps: [],
      selfTimeMaxMs: 0,
    }
    cur.renders += 1
    const mount = !fiber.alternate
    const cp = mount ? [] : changedProps(fiber)
    cur.changedProps = cp
    // Own props changed → re-render is prop-driven; otherwise it's state/hooks/context or a parent
    // re-render (cheaply indistinguishable without a hooks diff — kept honest rather than guessed).
    cur.lastReason = mount ? 'mount' : cp.length > 0 ? 'props' : 'state/hooks/parent'
    const timings = getTimings(fiber)
    const self = typeof timings?.selfTime === 'number' ? timings.selfTime : 0
    if (self > cur.selfTimeMaxMs) cur.selfTimeMaxMs = self
    state.stats.set(id, cur)
  })
}

// Installed once (also installs the RDT hook early so React connects). Idempotent.
export function installTracker(): void {
  if (state.installed) return
  state.installed = true
  instrument({onCommitFiberRoot: onCommit})
}

export function startTracking(): void {
  state.stats.clear()
  state.tracking = true
}

export function report(opts: {name?: string; limit?: number} = {}): TrackReport {
  const all = [...state.stats.values()]
  const timingsAvailable = all.some((s) => s.selfTimeMaxMs > 0)
  const filtered = opts.name ? all.filter((s) => s.component.toLowerCase().includes(opts.name!.toLowerCase())) : all
  const ranked = filtered.sort((a, b) => b.renders - a.renders).slice(0, opts.limit ?? 15)
  const components = ranked.map((s) => ({
    component: s.component,
    renders: s.renders,
    lastReason: s.lastReason,
    ...(s.changedProps.length > 0 ? {changedProps: s.changedProps} : {}),
    ...(timingsAvailable ? {selfTimeMaxMs: Number(s.selfTimeMaxMs.toFixed(2))} : {}),
  }))
  return {
    tracking: state.tracking,
    tracked: all.length,
    timingsAvailable,
    components,
    ...(timingsAvailable ? {} : {note: 'render durations need a profiling build (react-dom/profiling or <Profiler>)'}),
  }
}

export function stopTracking(): TrackReport {
  const r = report()
  state.tracking = false
  return {...r, tracking: false}
}
