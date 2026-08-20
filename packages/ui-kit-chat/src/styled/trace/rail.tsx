import {createEffect, onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {createResizeObserver} from '@solid-primitives/resize-observer'

const CORNER_RADIUS = 3

const SVG_CLASS =
  'absolute [inset-block-start:0] [inset-inline-start:0] w-[var(--chat-trace-gutter)] pointer-events-none rtl:-scale-x-100 origin-center'
const PATH_CLASS = '[stroke:var(--chat-glyph)] stroke-1 fill-none'
const LIVE_SVG_CLASS = `${SVG_CLASS} [clip-path:polygon(0_0,100%_0,100%_var(--rail-bottom,0px),0_var(--rail-bottom,0px))] [transition:clip-path_var(--rail-travel,320ms)_var(--chat-ease),opacity_260ms_var(--chat-ease)] motion-reduce:[transition:none]`
const LIVE_PATH_CLASS = '[stroke:var(--chat-accent)] stroke-1 fill-none'

const DOT_RADIUS = 1.5
const DOT_CLASS =
  'absolute [inset-block-start:-1.5px] size-[3px] pointer-events-none [transform:translateY(var(--rail-dot-y,0px))] [opacity:var(--rail-dot-o,0)] [transition:transform_var(--rail-travel,320ms)_var(--chat-ease),opacity_260ms_var(--chat-ease)] motion-reduce:[transition:none]'
const DOT_CORE_CLASS =
  'block size-full rounded-full [background:var(--chat-accent)] [box-shadow:0_0_4px_var(--chat-accent)]'
const DOT_PULSE_CLASS = 'anim-run-ring'

function spineX(gutter: number): number {
  return Math.round(gutter / 2) + 0.5
}

type RailGeometry = {gutter: number; top: number; anchors: number[]}

type RailPaths = {spine: string; arms: string}

function jointsRail(geometry: RailGeometry): RailPaths | undefined {
  const {gutter, top, anchors} = geometry
  const lastAnchor = anchors[anchors.length - 1]
  if (lastAnchor === undefined) return undefined
  const x = spineX(gutter)
  return {
    spine: `M ${x} ${top} L ${x} ${lastAnchor - CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${x + CORNER_RADIUS} ${lastAnchor} L ${gutter} ${lastAnchor}`,
    arms: anchors
      .slice(0, -1)
      .map((y) => `M ${x} ${y} L ${gutter} ${y}`)
      .join(' '),
  }
}

function rowAnchors(list: HTMLUListElement | undefined, rootTop: number, gutter: number): number[] {
  if (!list) return []
  if (list.getBoundingClientRect().height === 0) return []
  return Array.from(list.querySelectorAll(':scope > li')).map(
    (row) => row.getBoundingClientRect().top - rootTop + gutter / 2,
  )
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
}): JSX.Element {
  let svg: SVGSVGElement | undefined
  let spine: SVGPathElement | undefined
  let arms: SVGPathElement | undefined
  let liveSvg: SVGSVGElement | undefined
  let liveSpine: SVGPathElement | undefined
  let dot: HTMLSpanElement | undefined
  let pendingMeasureFrame: number | undefined
  let pendingPaintFrame: number | undefined
  let anchors: number[] = []
  let gutterCache = 0

  const refsNow = (): RailRefs | undefined =>
    readyRefs({root: props.root(), header: props.header(), svg, spine, arms, liveSvg, liveSpine, dot})

  const measure = (): void => {
    const refs = refsNow()
    if (!refs) return
    const gutter = Number.parseFloat(getComputedStyle(refs.root).getPropertyValue('--chat-trace-gutter'))
    if (!(gutter > 0)) return
    const rootRect = refs.root.getBoundingClientRect()
    if (rootRect.height === 0) return
    const headerTop = refs.header.getBoundingClientRect().top - rootRect.top
    anchors = [headerTop + gutter / 2, ...rowAnchors(props.list(), rootRect.top, gutter)]
    gutterCache = gutter
    const paths = jointsRail({gutter, top: headerTop, anchors})
    if (!paths) return
    refs.svg.setAttribute('width', `${gutter}`)
    refs.svg.setAttribute('height', `${rootRect.height}`)
    refs.spine.setAttribute('d', paths.spine)
    refs.arms.setAttribute('d', paths.arms)
    refs.liveSvg.setAttribute('width', `${gutter}`)
    refs.liveSvg.setAttribute('height', `${rootRect.height}`)
    refs.liveSpine.setAttribute('d', paths.spine)
    refs.dot.style.setProperty('inset-inline-start', `${spineX(gutter) - DOT_RADIUS}px`)
  }

  const paint = (): void => {
    const refs = refsNow()
    if (!refs) return
    const list = props.list()
    const liveRow = list?.getBoundingClientRect().height ? list.querySelector(':scope > li[data-trace-live]') : null
    if (liveRow instanceof HTMLElement) {
      const rootTop = refs.root.getBoundingClientRect().top
      const y = liveRow.getBoundingClientRect().top - rootTop + gutterCache / 2
      refs.liveSvg.style.setProperty('--rail-bottom', `${y}px`)
      refs.liveSvg.style.opacity = '1'
      refs.dot.style.setProperty('--rail-dot-y', `${y}px`)
      refs.dot.style.setProperty('--rail-dot-o', '1')
      return
    }
    const lastAnchor = anchors[anchors.length - 1]
    if (lastAnchor !== undefined) {
      refs.liveSvg.style.setProperty('--rail-bottom', `${lastAnchor}px`)
      refs.dot.style.setProperty('--rail-dot-y', `${lastAnchor}px`)
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
      <span ref={(element) => (dot = element)} aria-hidden="true" class={DOT_CLASS}>
        <span class={dotCoreClass()} />
      </span>
    </>
  )
}
