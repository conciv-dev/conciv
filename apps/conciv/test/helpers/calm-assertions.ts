const VIEWPORT_SELECTOR = '[role="log"][aria-live="off"]'
const TRACE_LIST_SELECTOR = '[aria-label="Execution trace"]'
const SURFACE_SELECTOR = [
  TRACE_LIST_SELECTOR,
  `${TRACE_LIST_SELECTOR} > li`,
  '[data-conciv-msg]',
  '[role="group"]',
  '[role="alert"]',
].join(', ')
const STAMP_ATTRIBUTE = 'data-calm-surface'
const TOLERANCE_PX = 1
const DESCRIPTION_LENGTH = 44
const SETTLE_PASSES = 3
const JANK_FRAME_MS = 33
const TOP_EDGE_PROBE_PX = 2

export type CalmAllowance = 'narration' | 'virtualization' | 'error-replacement' | 'user-collapsed-trace'

type CalmSurface = {stamp: string; description: string}

type CalmDrift = CalmSurface & {deltaBlock: number; deltaInline: number}

export type CalmCheckpoint = {rebaseline?: boolean}

export type FrameGaps = {frames: number; p50: number; p95: number; max: number; over33: number}

export type CalmWatch = {
  checkpoint: (options?: CalmCheckpoint) => Promise<void>
  removed: () => string[]
  drifted: () => string[]
  shiftedAboveLiveRegion: () => string[]
  narrationGlyphs: () => number
  frameGaps: () => FrameGaps
  stop: () => void
}

type FrameGapSampler = {gaps: () => FrameGaps; pause: () => void; resume: () => void}

type Anchor = {block: number; inline: number}

type Tracked = {
  stamp: string
  element: Element
  description: string
  origin: Anchor
  latest: Anchor
  visible: boolean
  insideTrace: boolean
  gone: boolean
}

type LayoutShiftSource = {node?: Node | null}

type LayoutShiftEntry = PerformanceEntry & {
  hadRecentInput: boolean
  sources: ReadonlyArray<LayoutShiftSource>
}

function isLayoutShiftEntry(entry: PerformanceEntry): entry is LayoutShiftEntry {
  return 'hadRecentInput' in entry && 'sources' in entry
}

function threadViewport(): HTMLElement {
  const viewport = document.querySelector<HTMLElement>(VIEWPORT_SELECTOR)
  if (!viewport) throw new Error('the calm harness could not find the thread viewport')
  return viewport
}

export function threadViewportElement(): HTMLElement {
  return threadViewport()
}

export type ScrollWatch = {
  stop: () => void
  maxDrift: () => number
  maxDistanceFromEnd: () => number
  distanceSeries: () => number[]
  framesBeyond: (limit: number) => number
  samples: () => number
  topEdgeRow: () => string | null
}

function distanceFromEnd(viewport: HTMLElement): number {
  return Math.max(0, viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop)
}

export function topEdgeRowIndex(viewport: HTMLElement): string | null {
  const frame = viewport.getBoundingClientRect()
  const found = document.elementFromPoint(frame.left + frame.width / 2, frame.top + TOP_EDGE_PROBE_PX)
  return found?.closest('[data-index]')?.getAttribute('data-index') ?? null
}

function topEdgeRowElement(viewport: HTMLElement): Element | null {
  const frame = viewport.getBoundingClientRect()
  const found = document.elementFromPoint(frame.left + frame.width / 2, frame.top + TOP_EDGE_PROBE_PX)
  return found?.closest('[data-index]') ?? null
}

function offsetWithinViewport(row: Element, viewport: HTMLElement): number {
  return row.getBoundingClientRect().top - viewport.getBoundingClientRect().top
}

export function topEdgeRowOffset(viewport: HTMLElement): number {
  const row = topEdgeRowElement(viewport)
  return row ? offsetWithinViewport(row, viewport) : 0
}

export function watchViewportScroll(): ScrollWatch {
  const viewport = threadViewport()
  const anchorRow = topEdgeRowElement(viewport)
  const anchorOffset = anchorRow ? offsetWithinViewport(anchorRow, viewport) : 0
  const drifts: number[] = []
  const distances: number[] = []
  const rows: (string | null)[] = []
  let handle = requestAnimationFrame(function tick() {
    if (anchorRow?.isConnected === true) drifts.push(Math.abs(offsetWithinViewport(anchorRow, viewport) - anchorOffset))
    distances.push(distanceFromEnd(viewport))
    rows.push(topEdgeRowIndex(viewport))
    handle = requestAnimationFrame(tick)
  })
  return {
    stop: () => cancelAnimationFrame(handle),
    maxDrift: () => Math.max(0, ...drifts),
    maxDistanceFromEnd: () => Math.max(0, ...distances),
    distanceSeries: () => distances.slice(),
    framesBeyond: (limit: number) =>
      distances.reduce(
        (state, distance) => {
          const run = distance > limit ? state.run + 1 : 0
          return {run, longest: Math.max(state.longest, run)}
        },
        {run: 0, longest: 0},
      ).longest,
    samples: () => drifts.length,
    topEdgeRow: () => {
      const seen = new Set(rows.filter((row): row is string => row !== null))
      return seen.size === 1 ? ([...seen][0] ?? null) : [...seen].join(',')
    },
  }
}

export function pinViewportToBottom(pixels: number): () => void {
  const viewport = threadViewport()
  const height = viewport.style.height
  const flex = viewport.style.flex
  viewport.style.height = `${pixels}px`
  viewport.style.flex = 'none'
  viewport.scrollTop = viewport.scrollHeight
  return () => {
    viewport.style.height = height
    viewport.style.flex = flex
  }
}

function narrationLines(viewport: HTMLElement): Element[] {
  return [...viewport.querySelectorAll('[role="status"]')].filter((node) => node.closest('[data-conciv-msg]') === null)
}

function liveRegionOf(viewport: HTMLElement): Element | undefined {
  return narrationLines(viewport).at(-1)
}

function isAboveLiveRegion(node: Element, region: Element | undefined): boolean {
  if (!region) return true
  if (node.contains(region)) return false
  return (node.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

function isPseudoElement(node: Element): boolean {
  return node.tagName.startsWith('::')
}

function describeSurface(node: Element): string {
  const role = node.getAttribute('role') ?? node.tagName.toLowerCase()
  const label = node.getAttribute('aria-label') ?? (node.textContent ?? '').replaceAll(/\s+/g, ' ').trim()
  return `${role}: ${label.slice(0, DESCRIPTION_LENGTH)}`
}

function anchorOf(node: Element, viewport: HTMLElement): Anchor {
  const box = node.getBoundingClientRect()
  const frame = viewport.getBoundingClientRect()
  return {
    block: box.top - frame.top + viewport.scrollTop,
    inline: box.left - frame.left + viewport.scrollLeft,
  }
}

function isWithinViewport(node: Element, viewport: HTMLElement): boolean {
  const box = node.getBoundingClientRect()
  const frame = viewport.getBoundingClientRect()
  return box.bottom > frame.top && box.top < frame.bottom
}

function hasFiniteIterations(animation: Animation): boolean {
  return animation.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY
}

function nextFrames(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function settleMotion(viewport: HTMLElement): Promise<void> {
  for (let pass = 0; pass < SETTLE_PASSES; pass += 1) {
    await nextFrames()
    const running = viewport.getAnimations({subtree: true}).filter(hasFiniteIterations)
    if (running.length === 0) return
    await Promise.allSettled(running.map((animation) => animation.finished))
  }
}

function driftOf(entry: Tracked): CalmDrift {
  return {
    stamp: entry.stamp,
    description: entry.description,
    deltaBlock: Math.round(entry.latest.block - entry.origin.block),
    deltaInline: Math.round(entry.latest.inline - entry.origin.inline),
  }
}

function isDrifted(drift: CalmDrift): boolean {
  return Math.abs(drift.deltaBlock) > TOLERANCE_PX || Math.abs(drift.deltaInline) > TOLERANCE_PX
}

function driftLine(drift: CalmDrift): string {
  return `${drift.description} moved ${drift.deltaBlock}px block / ${drift.deltaInline}px inline`
}

function errorReplaced(): boolean {
  return document.querySelector('[role="alert"]') !== null
}

function isPermitted(entry: Tracked, allowed: ReadonlySet<CalmAllowance>): boolean {
  if (allowed.has('narration') && entry.description.startsWith('status')) return true
  if (allowed.has('virtualization') && !entry.visible) return true
  if (allowed.has('error-replacement') && errorReplaced()) return true
  if (allowed.has('user-collapsed-trace') && entry.insideTrace) return true
  return false
}

function percentileOf(sorted: ReadonlyArray<number>, fraction: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}

function tenths(value: number): number {
  return Math.round(value * 10) / 10
}

function summariseGaps(gaps: ReadonlyArray<number>): FrameGaps {
  const sorted = gaps.toSorted((left, right) => left - right)
  return {
    frames: gaps.length,
    p50: tenths(percentileOf(sorted, 0.5)),
    p95: tenths(percentileOf(sorted, 0.95)),
    max: tenths(sorted.at(-1) ?? 0),
    over33: gaps.filter((gap) => gap > JANK_FRAME_MS).length,
  }
}

function startFrameGapSampler(): FrameGapSampler {
  const gaps: number[] = []
  let previous = performance.now()
  let handle = 0
  const tick = (now: number): void => {
    gaps.push(now - previous)
    previous = now
    handle = requestAnimationFrame(tick)
  }
  const resume = (): void => {
    previous = performance.now()
    handle = requestAnimationFrame(tick)
  }
  resume()
  return {gaps: () => summariseGaps(gaps), pause: () => cancelAnimationFrame(handle), resume}
}

export function createCalmWatch(options: {allow?: ReadonlyArray<CalmAllowance>} = {}): CalmWatch {
  const allowed = new Set<CalmAllowance>(options.allow ?? [])
  const tracked = new Map<string, Tracked>()
  const stamps = {count: 0}
  const shifted = new Set<string>()
  const collect = (entries: PerformanceEntryList) => {
    const viewport = document.querySelector<HTMLElement>(VIEWPORT_SELECTOR)
    if (!viewport) return
    const region = liveRegionOf(viewport)
    const isAboveSource = (node: Node | null | undefined): node is Element =>
      node instanceof Element && !isPseudoElement(node) && viewport.contains(node) && isAboveLiveRegion(node, region)
    for (const entry of entries) {
      if (!isLayoutShiftEntry(entry)) continue
      if (entry.hadRecentInput) continue
      const above = entry.sources.map((source) => source.node).filter(isAboveSource)
      for (const node of above) shifted.add(describeSurface(node))
    }
  }
  const observer = new PerformanceObserver((list) => collect(list.getEntries()))
  observer.observe({type: 'layout-shift', buffered: true})
  const sampler = startFrameGapSampler()
  const resample = (viewport: HTMLElement) => {
    for (const entry of tracked.values()) {
      if (entry.gone) continue
      if (!entry.element.isConnected) {
        entry.gone = true
        continue
      }
      entry.latest = anchorOf(entry.element, viewport)
      entry.visible = isWithinViewport(entry.element, viewport)
    }
  }
  const adopt = (viewport: HTMLElement, region: Element | undefined) => {
    for (const node of viewport.querySelectorAll(SURFACE_SELECTOR)) {
      if (node.hasAttribute(STAMP_ATTRIBUTE)) continue
      if (!isAboveLiveRegion(node, region)) continue
      stamps.count += 1
      const stamp = `calm-${stamps.count}`
      node.setAttribute(STAMP_ATTRIBUTE, stamp)
      const origin = anchorOf(node, viewport)
      tracked.set(stamp, {
        stamp,
        element: node,
        description: describeSurface(node),
        origin,
        latest: origin,
        visible: isWithinViewport(node, viewport),
        insideTrace: node.closest(TRACE_LIST_SELECTOR) !== null,
        gone: false,
      })
    }
  }
  const drainShifts = async (): Promise<void> => {
    await nextFrames()
    collect(observer.takeRecords())
  }
  return {
    checkpoint: async (options: CalmCheckpoint = {}) => {
      sampler.pause()
      try {
        const viewport = threadViewport()
        await settleMotion(viewport)
        resample(viewport)
        adopt(viewport, liveRegionOf(viewport))
        if (options.rebaseline !== true) return
        await drainShifts()
        resample(viewport)
        for (const [stamp, entry] of tracked) {
          if (entry.gone) tracked.delete(stamp)
          entry.origin = entry.latest
        }
        shifted.clear()
      } finally {
        sampler.resume()
      }
    },
    removed: () =>
      [...tracked.values()]
        .filter((entry) => entry.gone && !isPermitted(entry, allowed))
        .map((entry) => entry.description),
    drifted: () =>
      [...tracked.values()]
        .filter((entry) => !entry.gone)
        .map(driftOf)
        .filter(isDrifted)
        .map(driftLine),
    shiftedAboveLiveRegion: () => [...shifted].toSorted(),
    narrationGlyphs: () => narrationLines(threadViewport()).length,
    frameGaps: sampler.gaps,
    stop: () => {
      sampler.pause()
      observer.disconnect()
    },
  }
}
