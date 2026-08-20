import {onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {createResizeObserver} from '@solid-primitives/resize-observer'

const CORNER_RADIUS = 3

const SVG_CLASS =
  'absolute [inset-block-start:0] [inset-inline-start:0] w-[var(--chat-trace-gutter)] pointer-events-none rtl:-scale-x-100 origin-center'
const PATH_CLASS = '[stroke:var(--chat-glyph)] stroke-1 fill-none'

function spineD(gutter: number, lastAnchor: number): string {
  const x = Math.round(gutter / 2) + 0.5
  return `M ${x} 0 L ${x} ${lastAnchor - CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${x + CORNER_RADIUS} ${lastAnchor} L ${gutter} ${lastAnchor}`
}

export function TraceRail(props: {list: Accessor<HTMLUListElement | undefined>}): JSX.Element {
  let svg: SVGSVGElement | undefined
  let spine: SVGPathElement | undefined
  let arms: SVGPathElement | undefined
  let pendingFrame: number | undefined

  const measure = (): void => {
    const ul = props.list()
    if (!ul || !svg || !spine || !arms) return
    const gutter = Number.parseFloat(getComputedStyle(ul).getPropertyValue('--chat-trace-gutter'))
    if (!(gutter > 0)) return
    const ulRect = ul.getBoundingClientRect()
    if (ulRect.height === 0) return
    const rows = Array.from(ul.querySelectorAll(':scope > li'))
    const anchors = rows.map((row) => row.getBoundingClientRect().top - ulRect.top + gutter / 2)
    const lastAnchor = anchors[anchors.length - 1]
    if (lastAnchor === undefined) return
    svg.setAttribute('width', `${gutter}`)
    svg.setAttribute('height', `${ulRect.height}`)
    spine.setAttribute('d', spineD(gutter, lastAnchor))
    arms.setAttribute('d', '')
  }

  const scheduleMeasure = (): void => {
    if (pendingFrame !== undefined) return
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = undefined
      measure()
    })
  }

  onCleanup(() => {
    if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame)
  })

  onMount(() => {
    measure()
    createResizeObserver(() => props.list(), scheduleMeasure)
  })

  return (
    <svg ref={(element) => (svg = element)} aria-hidden="true" class={SVG_CLASS}>
      <path ref={(element) => (spine = element)} d="" class={PATH_CLASS} />
      <path ref={(element) => (arms = element)} d="" class={PATH_CLASS} />
    </svg>
  )
}
