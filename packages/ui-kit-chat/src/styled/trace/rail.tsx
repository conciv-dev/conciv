import {createEffect, onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {createResizeObserver} from '@solid-primitives/resize-observer'
import {useViewportInternal} from '../../primitives/thread/viewport-internal.js'

const CORNER_RADIUS = 3
const READING_BAND = '-32% 0px -67% 0px'

const SVG_CLASS =
  'absolute [inset-block-start:0] [inset-inline-start:0] w-[var(--chat-trace-gutter)] pointer-events-none rtl:-scale-x-100 origin-center'
const PATH_CLASS = '[stroke:var(--chat-glyph)] stroke-1 fill-none'
const LIVE_SVG_CLASS = `${SVG_CLASS} [clip-path:polygon(0_var(--rail-top,0px),100%_var(--rail-top,0px),100%_var(--rail-bottom,0px),0_var(--rail-bottom,0px))] [transition:clip-path_var(--rail-travel,320ms)_var(--chat-ease),opacity_260ms_var(--chat-ease)] motion-reduce:[transition:none]`
const LIVE_PATH_CLASS = '[stroke:var(--chat-accent)] stroke-1 fill-none'

function spineX(gutter: number): number {
  return Math.round(gutter / 2) + 0.5
}

type RailGeometry = {gutter: number; top: number; headerAnchor: number; rowAnchors: number[]; height: number}

type RailPaths = {spine: string; arms: string}

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
  }
}

function readRowAnchors(list: HTMLUListElement | undefined, rootTop: number, gutter: number): number[] {
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

export function TraceRail(props: {
  root: Accessor<HTMLElement | undefined>
  header: Accessor<HTMLElement | undefined>
  list: Accessor<HTMLUListElement | undefined>
  liveKey: Accessor<string | undefined>
  open: Accessor<boolean>
}): JSX.Element {
  const internal = useViewportInternal()
  let svg: SVGSVGElement | undefined
  let spine: SVGPathElement | undefined
  let arms: SVGPathElement | undefined
  let liveSvg: SVGSVGElement | undefined
  let liveSpine: SVGPathElement | undefined
  let pendingMeasureFrame: number | undefined
  let pendingPaintFrame: number | undefined
  let anchors: number[] = []
  let bandObserver: IntersectionObserver | undefined
  let observedCount = 0
  let inBand: boolean[] = []

  const visibleRows = (): HTMLUListElement | undefined => (props.open() ? props.list() : undefined)

  const focusRowIndex = (): number => inBand.indexOf(true)

  const observeRows = (): void => {
    const rows = Array.from(visibleRows()?.querySelectorAll(':scope > li') ?? [])
    if (rows.length === observedCount && bandObserver) return
    bandObserver?.disconnect()
    observedCount = rows.length
    inBand = rows.map(() => false)
    if (rows.length === 0) {
      bandObserver = undefined
      return
    }
    bandObserver = new IntersectionObserver(
      (entries) => {
        const current = Array.from(visibleRows()?.querySelectorAll(':scope > li') ?? [])
        for (const entry of entries) {
          const index = current.indexOf(entry.target)
          if (index >= 0) inBand[index] = entry.isIntersecting
        }
        schedulePaint()
      },
      {root: internal?.element() ?? document, rootMargin: READING_BAND},
    )
    for (const row of rows) bandObserver.observe(row)
  }

  const readGeometry = (): RailGeometry | undefined => {
    const root = props.root()
    const header = props.header()
    if (!root || !header) return undefined
    const gutter = Number.parseFloat(getComputedStyle(root).getPropertyValue('--chat-trace-gutter'))
    if (!(gutter > 0)) return undefined
    const rootRect = root.getBoundingClientRect()
    if (rootRect.height === 0) return undefined
    const top = header.getBoundingClientRect().top - rootRect.top
    return {
      gutter,
      top,
      headerAnchor: top + gutter / 2,
      rowAnchors: readRowAnchors(visibleRows(), rootRect.top, gutter),
      height: rootRect.height,
    }
  }

  const measure = (): void => {
    if (!svg || !spine || !arms || !liveSvg || !liveSpine) return
    const geometry = readGeometry()
    if (!geometry) return
    anchors = [geometry.headerAnchor, ...geometry.rowAnchors]
    const paths = jointsRail(geometry)
    svg.setAttribute('width', `${geometry.gutter}`)
    svg.setAttribute('height', `${geometry.height}`)
    spine.setAttribute('d', paths.spine)
    arms.setAttribute('d', paths.arms)
    liveSvg.setAttribute('width', `${geometry.gutter}`)
    liveSvg.setAttribute('height', `${geometry.height}`)
    liveSpine.setAttribute('d', paths.spine)
    observeRows()
  }

  const paint = (): void => {
    if (!liveSvg) return
    const live = liveRowIndex(visibleRows())
    const index = live >= 0 ? live : focusRowIndex()
    const enteredAnchor = index < 0 ? undefined : anchors[index]
    const activeAnchor = index < 0 ? undefined : anchors[index + 1]
    if (enteredAnchor !== undefined && activeAnchor !== undefined) {
      liveSvg.style.setProperty('--rail-top', `${enteredAnchor}px`)
      liveSvg.style.setProperty('--rail-bottom', `${activeAnchor}px`)
      liveSvg.style.opacity = '1'
      return
    }
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
    bandObserver?.disconnect()
  })

  onMount(() => {
    liveSvg?.style.setProperty('transition', 'none')
    measure()
    paint()
    liveSvg?.getBoundingClientRect()
    requestAnimationFrame(() => {
      liveSvg?.style.removeProperty('transition')
    })
    createResizeObserver(() => props.root(), scheduleMeasure)
    createResizeObserver(() => props.list(), scheduleMeasure)
  })

  createEffect(() => {
    props.open()
    measure()
    paint()
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
