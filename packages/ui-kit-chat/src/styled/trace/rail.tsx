import {createEffect, onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {createResizeObserver} from '@solid-primitives/resize-observer'

const CORNER_RADIUS = 3

const SVG_CLASS =
  'absolute [inset-block-start:0] [inset-inline-start:0] w-[var(--chat-trace-gutter)] pointer-events-none rtl:-scale-x-100 origin-center'
const PATH_CLASS = '[stroke:var(--chat-glyph)] stroke-1 fill-none'
const LIVE_SVG_CLASS = `${SVG_CLASS} [clip-path:polygon(0_0,100%_0,100%_var(--rail-bottom,0px),0_var(--rail-bottom,0px))] [transition:clip-path_var(--rail-travel,320ms)_var(--chat-ease),opacity_260ms_var(--chat-ease)] motion-reduce:[transition:none]`
const LIVE_PATH_CLASS = '[stroke:var(--chat-accent)] stroke-1 fill-none'

function spineD(gutter: number, lastAnchor: number): string {
  const x = Math.round(gutter / 2) + 0.5
  return `M ${x} 0 L ${x} ${lastAnchor - CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${x + CORNER_RADIUS} ${lastAnchor} L ${gutter} ${lastAnchor}`
}

type RailRefs = {
  ul: HTMLUListElement
  svg: SVGSVGElement
  spine: SVGPathElement
  arms: SVGPathElement
  liveSvg: SVGSVGElement
  liveSpine: SVGPathElement
}

function readyRefs(
  ul: HTMLUListElement | undefined,
  svg: SVGSVGElement | undefined,
  spine: SVGPathElement | undefined,
  arms: SVGPathElement | undefined,
  liveSvg: SVGSVGElement | undefined,
  liveSpine: SVGPathElement | undefined,
): RailRefs | undefined {
  if (!ul || !svg || !spine || !arms || !liveSvg || !liveSpine) return undefined
  return {ul, svg, spine, arms, liveSvg, liveSpine}
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
  let pendingMeasureFrame: number | undefined
  let pendingPaintFrame: number | undefined
  let anchors: number[] = []
  let gutterCache = 0

  const measure = (): void => {
    const refs = readyRefs(props.list(), svg, spine, arms, liveSvg, liveSpine)
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
  }

  const paint = (): void => {
    const ul = props.list()
    if (!ul || !liveSvg) return
    const liveRow = ul.querySelector(':scope > li[data-trace-live]')
    if (liveRow instanceof HTMLElement) {
      const ulRect = ul.getBoundingClientRect()
      const liRect = liveRow.getBoundingClientRect()
      const y = liRect.top - ulRect.top + gutterCache / 2
      liveSvg.style.setProperty('--rail-bottom', `${y}px`)
      liveSvg.style.opacity = '1'
      return
    }
    const lastAnchor = anchors[anchors.length - 1]
    if (lastAnchor !== undefined) liveSvg.style.setProperty('--rail-bottom', `${lastAnchor}px`)
    liveSvg.style.opacity = '0'
  }

  const scheduleMeasure = (): void => {
    if (pendingMeasureFrame !== undefined) return
    pendingMeasureFrame = requestAnimationFrame(() => {
      pendingMeasureFrame = undefined
      liveSvg?.style.setProperty('--rail-travel', '0ms')
      measure()
      paint()
      requestAnimationFrame(() => {
        liveSvg?.style.removeProperty('--rail-travel')
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
    measure()
    paint()
    liveSvg?.getBoundingClientRect()
    requestAnimationFrame(() => {
      liveSvg?.style.removeProperty('transition')
    })
    createResizeObserver(() => props.list(), scheduleMeasure)
  })

  createEffect(() => {
    props.liveKey()
    schedulePaint()
  })

  return (
    <>
      <svg ref={(element) => (svg = element)} aria-hidden="true" class={SVG_CLASS}>
        <path ref={(element) => (spine = element)} d="" class={PATH_CLASS} />
        <path ref={(element) => (arms = element)} d="" class={PATH_CLASS} />
      </svg>
      <svg ref={(element) => (liveSvg = element)} aria-hidden="true" class={LIVE_SVG_CLASS} style={{opacity: 0}}>
        <path ref={(element) => (liveSpine = element)} d="" class={LIVE_PATH_CLASS} />
      </svg>
    </>
  )
}
