import {createEffect, onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {createResizeObserver} from '@solid-primitives/resize-observer'

const CORNER_RADIUS = 3
const CURVE_LEAD = 4
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const DISTANCE_STEPS = 24

const SVG_CLASS =
  'absolute [inset-block-start:0] [inset-inline-start:0] w-[var(--chat-trace-gutter)] pointer-events-none rtl:-scale-x-100 origin-center'
const PATH_CLASS = '[stroke:var(--chat-glyph)] stroke-1 fill-none'
const LIVE_SVG_CLASS = `${SVG_CLASS} [clip-path:polygon(0_0,100%_0,100%_var(--rail-bottom,0px),0_var(--rail-bottom,0px))] [transition:clip-path_var(--rail-travel,320ms)_var(--chat-ease),opacity_260ms_var(--chat-ease)] motion-reduce:[transition:none]`
const LIVE_PATH_CLASS = '[stroke:var(--chat-accent)] stroke-1 fill-none'

const DOT_LAYER_CLASS =
  'absolute [inset-block:0] [inset-inline-start:0] w-[var(--chat-trace-gutter)] pointer-events-none rtl:-scale-x-100 origin-center'
const DOT_CLASS =
  'absolute [top:0] [left:0] size-[3px] [offset-distance:var(--rail-dot-distance,0px)] [opacity:var(--rail-dot-o,0)] [transition:offset-distance_var(--rail-travel,320ms)_var(--chat-ease),opacity_260ms_var(--chat-ease)] motion-reduce:[transition:none]'
const DOT_CORE_CLASS =
  'block size-full rounded-full [background:var(--chat-accent)] [box-shadow:0_0_4px_var(--chat-accent)]'
const DOT_PULSE_CLASS = 'anim-run-ring'

export type RailVariant = 'joints' | 'clerk'

function spineX(gutter: number): number {
  return Math.round(gutter / 2) + 0.5
}

function crisp(value: number): number {
  return Math.round(value - 0.5) + 0.5
}

function headerX(gutter: number): number {
  return crisp(spineX(gutter) - (gutter / 2 - 1))
}

type RailGeometry = {gutter: number; top: number; headerAnchor: number; rowAnchors: number[]}

type RailPaths = {spine: string; arms: string; track: string}

function jointsRail(geometry: RailGeometry): RailPaths {
  const {gutter, top, headerAnchor, rowAnchors} = geometry
  const anchors = [headerAnchor, ...rowAnchors]
  const lastAnchor = anchors[anchors.length - 1] ?? headerAnchor
  const x = spineX(gutter)
  return {
    spine: `M ${x} ${top} L ${x} ${lastAnchor - CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${x + CORNER_RADIUS} ${lastAnchor} L ${gutter} ${lastAnchor}`,
    arms: anchors
      .slice(0, -1)
      .map((y) => `M ${x} ${y} L ${gutter} ${y}`)
      .join(' '),
    track: `M ${x} ${top} L ${x} ${lastAnchor}`,
  }
}

function clerkRail(geometry: RailGeometry): RailPaths {
  const {gutter, top, headerAnchor, rowAnchors} = geometry
  const headX = headerX(gutter)
  const rowX = spineX(gutter)
  const firstRow = rowAnchors[0]
  if (firstRow === undefined) {
    const stub = `M ${headX} ${top} L ${headX} ${headerAnchor}`
    return {spine: stub, arms: '', track: stub}
  }
  const descent = rowAnchors
    .slice(1)
    .map((y) => ` L ${rowX} ${y}`)
    .join('')
  const spine = `M ${headX} ${headerAnchor} C ${headX} ${firstRow - CURVE_LEAD} ${rowX} ${headerAnchor + CURVE_LEAD} ${rowX} ${firstRow}${descent}`
  return {spine, arms: '', track: spine}
}

const RAILS: Record<RailVariant, (geometry: RailGeometry) => RailPaths> = {joints: jointsRail, clerk: clerkRail}

type RailStop = {y: number; distance: number}

function distanceAtY(path: SVGPathElement, total: number, y: number): number {
  let low = 0
  let high = total
  for (let step = 0; step < DISTANCE_STEPS; step += 1) {
    const middle = (low + high) / 2
    if (path.getPointAtLength(middle).y < y) low = middle
    else high = middle
  }
  return high
}

function railStops(track: string, anchors: number[]): RailStop[] {
  const path = document.createElementNS(SVG_NAMESPACE, 'path')
  path.setAttribute('d', track)
  const total = path.getTotalLength()
  return anchors.map((y) => ({y, distance: distanceAtY(path, total, y)}))
}

function rowAnchors(list: HTMLUListElement | undefined, rootTop: number, gutter: number): number[] {
  if (!list) return []
  if (list.getBoundingClientRect().height === 0) return []
  return Array.from(list.querySelectorAll(':scope > li')).map(
    (row) => row.getBoundingClientRect().top - rootTop + gutter / 2,
  )
}

function liveRowIndex(list: HTMLUListElement | undefined): number {
  if (!list) return -1
  if (list.getBoundingClientRect().height === 0) return -1
  return Array.from(list.querySelectorAll(':scope > li')).findIndex((row) => row.hasAttribute('data-trace-live'))
}

type RailRefs = {
  root: HTMLElement
  header: HTMLElement
  svg: SVGSVGElement
  spine: SVGPathElement
  arms: SVGPathElement
  liveSvg: SVGSVGElement
  liveSpine: SVGPathElement
  dot: HTMLSpanElement
}

function readyRefs(parts: Partial<RailRefs>): RailRefs | undefined {
  const {root, header, svg, spine, arms, liveSvg, liveSpine, dot} = parts
  if (!root || !header || !svg || !spine || !arms || !liveSvg || !liveSpine || !dot) return undefined
  return {root, header, svg, spine, arms, liveSvg, liveSpine, dot}
}

export function TraceRail(props: {
  root: Accessor<HTMLElement | undefined>
  header: Accessor<HTMLElement | undefined>
  list: Accessor<HTMLUListElement | undefined>
  liveKey: Accessor<string | undefined>
  rail: Accessor<RailVariant>
  open: Accessor<boolean>
}): JSX.Element {
  let svg: SVGSVGElement | undefined
  let spine: SVGPathElement | undefined
  let arms: SVGPathElement | undefined
  let liveSvg: SVGSVGElement | undefined
  let liveSpine: SVGPathElement | undefined
  let dot: HTMLSpanElement | undefined
  let pendingMeasureFrame: number | undefined
  let pendingPaintFrame: number | undefined
  let stops: RailStop[] = []

  const refsNow = (): RailRefs | undefined =>
    readyRefs({root: props.root(), header: props.header(), svg, spine, arms, liveSvg, liveSpine, dot})

  const visibleRows = (): HTMLUListElement | undefined => (props.open() ? props.list() : undefined)

  const measure = (): void => {
    const refs = refsNow()
    if (!refs) return
    const gutter = Number.parseFloat(getComputedStyle(refs.root).getPropertyValue('--chat-trace-gutter'))
    if (!(gutter > 0)) return
    const rootRect = refs.root.getBoundingClientRect()
    if (rootRect.height === 0) return
    const top = refs.header.getBoundingClientRect().top - rootRect.top
    const geometry = {
      gutter,
      top,
      headerAnchor: top + gutter / 2,
      rowAnchors: rowAnchors(visibleRows(), rootRect.top, gutter),
    }
    const paths = RAILS[props.rail()](geometry)
    stops = railStops(paths.track, [geometry.headerAnchor, ...geometry.rowAnchors])
    refs.svg.setAttribute('width', `${gutter}`)
    refs.svg.setAttribute('height', `${rootRect.height}`)
    refs.spine.setAttribute('d', paths.spine)
    refs.arms.setAttribute('d', paths.arms)
    refs.liveSvg.setAttribute('width', `${gutter}`)
    refs.liveSvg.setAttribute('height', `${rootRect.height}`)
    refs.liveSpine.setAttribute('d', paths.spine)
    refs.dot.style.setProperty('offset-path', `path("${paths.track}")`)
  }

  const paint = (): void => {
    const refs = refsNow()
    if (!refs) return
    const index = liveRowIndex(visibleRows())
    const live = index < 0 ? undefined : stops[index + 1]
    if (live) {
      refs.liveSvg.style.setProperty('--rail-bottom', `${live.y}px`)
      refs.liveSvg.style.opacity = '1'
      refs.dot.style.setProperty('--rail-dot-distance', `${live.distance}px`)
      refs.dot.style.setProperty('--rail-dot-o', '1')
      return
    }
    const settled = stops[stops.length - 1]
    if (settled) {
      refs.liveSvg.style.setProperty('--rail-bottom', `${settled.y}px`)
      refs.dot.style.setProperty('--rail-dot-distance', `${settled.distance}px`)
    }
    refs.liveSvg.style.opacity = '0'
    refs.dot.style.setProperty('--rail-dot-o', '0')
  }

  const scheduleMeasure = (): void => {
    if (pendingMeasureFrame !== undefined) return
    pendingMeasureFrame = requestAnimationFrame(() => {
      pendingMeasureFrame = undefined
      liveSvg?.style.setProperty('--rail-travel', '0ms')
      dot?.style.setProperty('--rail-travel', '0ms')
      measure()
      paint()
      requestAnimationFrame(() => {
        liveSvg?.style.removeProperty('--rail-travel')
        dot?.style.removeProperty('--rail-travel')
      })
    })
  }

  const schedulePaint = (): void => {
    if (pendingPaintFrame !== undefined) return
    pendingPaintFrame = requestAnimationFrame(() => {
      pendingPaintFrame = undefined
      paint()
    })
  }

  onCleanup(() => {
    if (pendingMeasureFrame !== undefined) cancelAnimationFrame(pendingMeasureFrame)
    if (pendingPaintFrame !== undefined) cancelAnimationFrame(pendingPaintFrame)
  })

  onMount(() => {
    liveSvg?.style.setProperty('transition', 'none')
    dot?.style.setProperty('transition', 'none')
    measure()
    paint()
    liveSvg?.getBoundingClientRect()
    requestAnimationFrame(() => {
      liveSvg?.style.removeProperty('transition')
      dot?.style.removeProperty('transition')
    })
    createResizeObserver(() => props.root(), scheduleMeasure)
    createResizeObserver(() => props.list(), scheduleMeasure)
  })

  createEffect(() => {
    props.rail()
    props.open()
    measure()
    paint()
  })

  createEffect(() => {
    props.liveKey()
    schedulePaint()
  })

  const dotCoreClass = (): string => (props.liveKey() ? `${DOT_CORE_CLASS}  ${DOT_PULSE_CLASS}` : DOT_CORE_CLASS)

  return (
    <>
      <svg ref={(element) => (svg = element)} aria-hidden="true" class={SVG_CLASS}>
        <path ref={(element) => (spine = element)} d="" class={PATH_CLASS} />
        <path ref={(element) => (arms = element)} d="" class={PATH_CLASS} />
      </svg>
      <svg ref={(element) => (liveSvg = element)} aria-hidden="true" class={LIVE_SVG_CLASS} style={{opacity: 0}}>
        <path ref={(element) => (liveSpine = element)} d="" class={LIVE_PATH_CLASS} />
      </svg>
      <span aria-hidden="true" class={DOT_LAYER_CLASS}>
        <span ref={(element) => (dot = element)} class={DOT_CLASS}>
          <span class={dotCoreClass()} />
        </span>
      </span>
    </>
  )
}
