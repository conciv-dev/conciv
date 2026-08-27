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

export type CalmAllowance = 'narration' | 'virtualization' | 'error-replacement' | 'user-collapsed-trace'

type CalmSurface = {stamp: string; description: string}

type CalmDrift = CalmSurface & {deltaBlock: number; deltaInline: number}

export type CalmWatch = {
  checkpoint: () => Promise<void>
  removed: () => string[]
  drifted: () => string[]
  shiftedAboveLiveRegion: () => string[]
  narrationGlyphs: () => number
  stop: () => void
}

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

async function settleMotion(viewport: HTMLElement): Promise<void> {
  const running = viewport.getAnimations({subtree: true}).filter(hasFiniteIterations)
  await Promise.allSettled(running.map((animation) => animation.finished))
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

export function createCalmWatch(options: {allow?: ReadonlyArray<CalmAllowance>} = {}): CalmWatch {
  const allowed = new Set<CalmAllowance>(options.allow ?? [])
  const tracked = new Map<string, Tracked>()
  const stamps = {count: 0}
  const shifted = new Set<string>()
  const observer = new PerformanceObserver((list) => {
    const viewport = document.querySelector<HTMLElement>(VIEWPORT_SELECTOR)
    if (!viewport) return
    const region = liveRegionOf(viewport)
    const isAboveSource = (node: Node | null | undefined): node is Element =>
      node instanceof Element && viewport.contains(node) && isAboveLiveRegion(node, region)
    for (const entry of list.getEntries()) {
      if (!isLayoutShiftEntry(entry)) continue
      if (entry.hadRecentInput) continue
      const above = entry.sources.map((source) => source.node).filter(isAboveSource)
      for (const node of above) shifted.add(describeSurface(node))
    }
  })
  observer.observe({type: 'layout-shift', buffered: true})
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
  return {
    checkpoint: async () => {
      const viewport = threadViewport()
      await settleMotion(viewport)
      resample(viewport)
      adopt(viewport, liveRegionOf(viewport))
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
    stop: () => observer.disconnect(),
  }
}
