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

function spineD(gutter: number, lastAnchor: number): string {
  const x = spineX(gutter)
  return `M ${x} 0 L ${x} ${lastAnchor - CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${x + CORNER_RADIUS} ${lastAnchor} L ${gutter} ${lastAnchor}`
}

type RailRefs = {
  ul: HTMLUListElement
  svg: SVGSVGElement
  spine: SVGPathElement
  arms: SVGPathElement
  liveSvg: SVGSVGElement
  liveSpine: SVGPathElement
  dot: HTMLSpanElement
}

function readyRefs(
  ul: HTMLUListElement | undefined,
  svg: SVGSVGElement | undefined,
  spine: SVGPathElement | undefined,
  arms: SVGPathElement | undefined,
  liveSvg: SVGSVGElement | undefined,
  liveSpine: SVGPathElement | undefined,
  dot: HTMLSpanElement | undefined,
): RailRefs | undefined {
  if (!ul || !svg || !spine || !arms || !liveSvg || !liveSpine || !dot) return undefined
  return {ul, svg, spine, arms, liveSvg, liveSpine, dot}
}

export function TraceRail(props: {
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

  const measure = (): void => {
    const refs = readyRefs(props.list(), svg, spine, arms, liveSvg, liveSpine, dot)
    if (!refs) return
    const gutter = Number.parseFloat(getComputedStyle(refs.ul).getPropertyValue('--chat-trace-gutter'))
    if (!(gutter > 0)) return
    const ulRect = refs.ul.getBoundingClientRect()
    if (ulRect.height === 0) return
    const rows = Array.from(refs.ul.querySelectorAll(':scope > li'))
    anchors = rows.map((row) => row.getBoundingClientRect().top - ulRect.top + gutter / 2)
    gutterCache = gutter
    const lastAnchor = anchors[anchors.length - 1]
    if (lastAnchor === undefined) return
    const d = spineD(gutter, lastAnchor)
    refs.svg.setAttribute('width', `${gutter}`)
    refs.svg.setAttribute('height', `${ulRect.height}`)
    refs.spine.setAttribute('d', d)
    refs.arms.setAttribute('d', '')
    refs.liveSvg.setAttribute('width', `${gutter}`)
    refs.liveSvg.setAttribute('height', `${ulRect.height}`)
    refs.liveSpine.setAttribute('d', d)
    refs.dot.style.setProperty('inset-inline-start', `${spineX(gutterCache) - DOT_RADIUS}px`)
  }

  const paint = (): void => {
    const ul = props.list()
    if (!ul || !liveSvg || !dot) return
    const liveRow = ul.querySelector(':scope > li[data-trace-live]')
    if (liveRow instanceof HTMLElement) {
      const ulRect = ul.getBoundingClientRect()
      const liRect = liveRow.getBoundingClientRect()
      const y = liRect.top - ulRect.top + gutterCache / 2
      liveSvg.style.setProperty('--rail-bottom', `${y}px`)
      liveSvg.style.opacity = '1'
      dot.style.setProperty('--rail-dot-y', `${y}px`)
      dot.style.setProperty('--rail-dot-o', '1')
      return
    }
    const lastAnchor = anchors[anchors.length - 1]
    if (lastAnchor !== undefined) {
      liveSvg.style.setProperty('--rail-bottom', `${lastAnchor}px`)
      dot.style.setProperty('--rail-dot-y', `${lastAnchor}px`)
    }
    liveSvg.style.opacity = '0'
    dot.style.setProperty('--rail-dot-o', '0')
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
