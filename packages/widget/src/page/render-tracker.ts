import {instrument, traverseRenderedFibers, getFiberId, getDisplayName, isCompositeFiber, getTimings} from 'bippy'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bippy fibers are untyped internals
type Fiber = any

type Stat = {component: string; renders: number; lastReason: string; changedProps: string[]; selfTimeMaxMs: number}

export type TrackReport = {
  tracking: boolean
  tracked: number

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

function changedProps(fiber: Fiber): string[] {
  const next = fiber.memoizedProps
  const prev = fiber.alternate?.memoizedProps
  if (!prev || !next || typeof next !== 'object' || typeof prev !== 'object') return []
  const out: string[] = []
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) if (prev[k] !== next[k]) out.push(k)
  return out
}

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

    cur.lastReason = mount ? 'mount' : cp.length > 0 ? 'props' : 'state/hooks/parent'
    const timings = getTimings(fiber)
    const self = typeof timings?.selfTime === 'number' ? timings.selfTime : 0
    if (self > cur.selfTimeMaxMs) cur.selfTimeMaxMs = self
    state.stats.set(id, cur)
  })
}

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
  const ranked = filtered.toSorted((a, b) => b.renders - a.renders).slice(0, opts.limit ?? 15)
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
