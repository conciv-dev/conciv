import {createEffect, onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {createResizeObserver} from '@solid-primitives/resize-observer'

const CORNER_RADIUS = 3
const STROKE = 1

const LAYER =
  'absolute [inset-block-start:0] [inset-inline-start:0] pointer-events-none rtl:-scale-x-100 origin-center [clip-path:polygon(var(--rail-x1)_var(--rail-y1),var(--rail-x2)_var(--rail-y1),var(--rail-x2)_var(--rail-y2),var(--rail-x1)_var(--rail-y2))] [transition:clip-path_320ms_var(--chat-ease)] motion-reduce:[transition:none]'
const GLYPH_PATH = '[stroke:var(--chat-glyph)] stroke-1 fill-none'
const LIVE_PATH = '[stroke:var(--chat-accent)] stroke-1 fill-none'

type Axis = 'vertical' | 'horizontal'

type Box = {start: number; end: number}

type Plan = {width: number; height: number; spine: string; arms: string; band: Box; extent: number}

type ClipRect = {x1: number; y1: number; x2: number; y2: number}

function centerline(value: number): number {
  return Math.round(value) + 0.5
}

function boxesOf(list: HTMLUListElement | undefined, rootRect: DOMRect, axis: Axis): Box[] {
  if (!list) return []
  return Array.from(list.querySelectorAll(':scope > li')).map((row) => {
    const rect = row.getBoundingClientRect()
    if (axis === 'vertical') return {start: rect.top - rootRect.top, end: rect.bottom - rootRect.top}
    return {start: rect.left - rootRect.left, end: rect.right - rootRect.left}
  })
}

function centerOf(box: Box): number {
  return centerline((box.start + box.end) / 2)
}

function verticalPlan(gutter: number, rootRect: DOMRect, headerCenter: number, rows: Box[], active: number): Plan {
  const x = centerline(gutter / 2)
  const armStart = x + STROKE / 2
  const anchors = [headerCenter, ...rows.map(centerOf)]
  const last = anchors[anchors.length - 1] ?? headerCenter
  const activeAnchor = anchors[active + 1] ?? last
  const enteredAnchor = anchors[active] ?? headerCenter
  return {
    width: rootRect.width,
    height: rootRect.height,
    spine: `M ${x} 0 L ${x} ${last - CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${x + CORNER_RADIUS} ${last} L ${gutter} ${last}`,
    arms: anchors
      .slice(0, -1)
      .map((y) => `M ${armStart} ${y} L ${gutter} ${y}`)
      .join(' '),
    band: {start: enteredAnchor + STROKE, end: activeAnchor + STROKE},
    extent: rootRect.height,
  }
}

function horizontalPlan(rootRect: DOMRect, rows: Box[], active: number): Plan {
  const y = centerline(rootRect.height - STROKE)
  const row = rows[active]
  return {
    width: rootRect.width,
    height: rootRect.height,
    spine: `M 0 ${y} L ${rootRect.width} ${y}`,
    arms: '',
    band: row ? {start: row.start, end: row.end} : {start: 0, end: 0},
    extent: rootRect.width,
  }
}

function clipsFor(plan: Plan, axis: Axis): {live: ClipRect; before: ClipRect; after: ClipRect} {
  if (axis === 'vertical')
    return {
      live: {x1: 0, y1: plan.band.start, x2: plan.width, y2: plan.band.end},
      before: {x1: 0, y1: 0, x2: plan.width, y2: plan.band.start},
      after: {x1: 0, y1: plan.band.end, x2: plan.width, y2: plan.extent},
    }
  return {
    live: {x1: plan.band.start, y1: 0, x2: plan.band.end, y2: plan.height},
    before: {x1: 0, y1: 0, x2: plan.band.start, y2: plan.height},
    after: {x1: plan.band.end, y1: 0, x2: plan.extent, y2: plan.height},
  }
}

function applyClip(element: SVGSVGElement | undefined, rect: ClipRect): void {
  if (!element) return
  element.style.setProperty('--rail-x1', `${rect.x1}px`)
  element.style.setProperty('--rail-y1', `${rect.y1}px`)
  element.style.setProperty('--rail-x2', `${rect.x2}px`)
  element.style.setProperty('--rail-y2', `${rect.y2}px`)
}

export function SettingsRail(props: {
  root: Accessor<HTMLElement | undefined>
  header: Accessor<HTMLElement | undefined>
  list: Accessor<HTMLUListElement | undefined>
  active: Accessor<number>
}): JSX.Element {
  let before: SVGSVGElement | undefined
  let beforeSpine: SVGPathElement | undefined
  let beforeArms: SVGPathElement | undefined
  let after: SVGSVGElement | undefined
  let afterSpine: SVGPathElement | undefined
  let afterArms: SVGPathElement | undefined
  let live: SVGSVGElement | undefined
  let liveSpine: SVGPathElement | undefined
  let liveArms: SVGPathElement | undefined
  let pendingFrame: number | undefined

  const readAxis = (root: HTMLElement): Axis =>
    getComputedStyle(root).getPropertyValue('--rail-axis').trim() === 'horizontal' ? 'horizontal' : 'vertical'

  const planOf = (): {plan: Plan; axis: Axis} | undefined => {
    const root = props.root()
    if (!root) return undefined
    const rootRect = root.getBoundingClientRect()
    if (rootRect.height === 0 || rootRect.width === 0) return undefined
    const axis = readAxis(root)
    const rows = boxesOf(props.list(), rootRect, axis)
    if (rows.length === 0) return undefined
    if (axis === 'horizontal') return {plan: horizontalPlan(rootRect, rows, props.active()), axis}
    const gutter = Number.parseFloat(getComputedStyle(root).getPropertyValue('--chat-trace-gutter'))
    if (!(gutter > 0)) return undefined
    const header = props.header()
    const headerRect = header?.getBoundingClientRect()
    const headerCenter = headerRect
      ? centerline(headerRect.top + headerRect.height / 2 - rootRect.top)
      : centerline(gutter / 2)
    return {plan: verticalPlan(gutter, rootRect, headerCenter, rows, props.active()), axis}
  }

  const paint = (): void => {
    const measured = planOf()
    if (!measured) return
    const {plan, axis} = measured
    for (const layer of [before, after, live]) {
      layer?.setAttribute('width', `${plan.width}`)
      layer?.setAttribute('height', `${plan.height}`)
    }
    for (const path of [beforeSpine, afterSpine, liveSpine]) path?.setAttribute('d', plan.spine)
    for (const path of [beforeArms, afterArms, liveArms]) path?.setAttribute('d', plan.arms)
    const clips = clipsFor(plan, axis)
    applyClip(before, clips.before)
    applyClip(after, clips.after)
    applyClip(live, clips.live)
  }

  const schedulePaint = (): void => {
    if (pendingFrame !== undefined) return
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = undefined
      paint()
    })
  }

  onCleanup(() => {
    if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame)
  })

  onMount(() => {
    for (const layer of [before, after, live]) layer?.style.setProperty('transition', 'none')
    paint()
    live?.getBoundingClientRect()
    requestAnimationFrame(() => {
      for (const layer of [before, after, live]) layer?.style.removeProperty('transition')
    })
    createResizeObserver(() => props.root(), schedulePaint)
    createResizeObserver(() => props.list(), schedulePaint)
  })

  createEffect(() => {
    props.active()
    schedulePaint()
  })

  return (
    <>
      <svg ref={(element) => (before = element)} aria-hidden="true" class={LAYER}>
        <path ref={(element) => (beforeSpine = element)} d="" class={GLYPH_PATH} />
        <path ref={(element) => (beforeArms = element)} d="" class={GLYPH_PATH} />
      </svg>
      <svg ref={(element) => (after = element)} aria-hidden="true" class={LAYER}>
        <path ref={(element) => (afterSpine = element)} d="" class={GLYPH_PATH} />
        <path ref={(element) => (afterArms = element)} d="" class={GLYPH_PATH} />
      </svg>
      <svg ref={(element) => (live = element)} aria-hidden="true" class={LAYER}>
        <path ref={(element) => (liveSpine = element)} d="" class={LIVE_PATH} />
        <path ref={(element) => (liveArms = element)} d="" class={LIVE_PATH} />
      </svg>
    </>
  )
}
