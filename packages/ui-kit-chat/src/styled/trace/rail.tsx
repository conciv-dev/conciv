import {createEffect, onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {createResizeObserver} from '@solid-primitives/resize-observer'

const CORNER_RADIUS = 3

const SVG_CLASS =
  'absolute [inset-block-start:0] [inset-inline-start:0] w-[var(--chat-trace-gutter)] pointer-events-none rtl:-scale-x-100 origin-center'
const PATH_CLASS = '[stroke:var(--chat-glyph)] stroke-1 fill-none'
const RUN_SVG_CLASS = `${SVG_CLASS} [clip-path:polygon(0_var(--rail-top,0px),100%_var(--rail-top,0px),100%_var(--rail-bottom,0px),0_var(--rail-bottom,0px))] [transition:clip-path_var(--rail-travel,320ms)_var(--chat-ease),opacity_260ms_var(--chat-ease)] motion-reduce:[transition:none]`
const RUN_PATH_CLASS = '[stroke:var(--chat-accent)] stroke-1 fill-none'

function spineX(gutter: number): number {
  return Math.round(gutter / 2) + 0.5
}

type RailGeometry = {
  gutter: number
  top: number
  headerAnchor: number
  rowAnchors: number[]
  runningRowIndex: number
  height: number
}

type RailPaths = {spine: string; arms: string}

type InboundConnector = {from: number; to: number}

function railPaths(geometry: RailGeometry): RailPaths {
  const {gutter, top, headerAnchor, rowAnchors} = geometry
  const lastRowAnchor = rowAnchors[rowAnchors.length - 1]
  if (lastRowAnchor === undefined) return {spine: '', arms: ''}
  const x = spineX(gutter)
  const armAnchors = [headerAnchor, ...rowAnchors.slice(0, -1)]
  return {
    spine: `M ${x} ${top} L ${x} ${lastRowAnchor - CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${x + CORNER_RADIUS} ${lastRowAnchor} L ${gutter} ${lastRowAnchor}`,
    arms: armAnchors.map((y) => `M ${x} ${y} L ${gutter} ${y}`).join(' '),
  }
}

function inboundConnectorOfRunningRow(geometry: RailGeometry): InboundConnector | undefined {
  const rowIndex = geometry.runningRowIndex
  const to = geometry.rowAnchors[rowIndex]
  if (to === undefined) return undefined
  const from = rowIndex === 0 ? geometry.headerAnchor : geometry.rowAnchors[rowIndex - 1]
  return from === undefined ? undefined : {from, to}
}

function sizeSvg(svg: SVGSVGElement, geometry: RailGeometry): void {
  svg.setAttribute('width', `${geometry.gutter}`)
  svg.setAttribute('height', `${geometry.height}`)
}

function renderedRows(list: HTMLUListElement | undefined): HTMLElement[] {
  if (!list) return []
  return Array.from(list.querySelectorAll(':scope > li')).filter(
    (row): row is HTMLElement => row instanceof HTMLElement && row.getBoundingClientRect().height > 0,
  )
}

export function TraceRail(props: {
  root: Accessor<HTMLElement | undefined>
  header: Accessor<HTMLElement | undefined>
  list: Accessor<HTMLUListElement | undefined>
  liveKey: Accessor<string | undefined>
  open: Accessor<boolean>
}): JSX.Element {
  let railSvg: SVGSVGElement | undefined
  let spineLine: SVGPathElement | undefined
  let armTicks: SVGPathElement | undefined
  let runSvg: SVGSVGElement | undefined
  let runLine: SVGPathElement | undefined
  let pendingReflowFrame: number | undefined
  let pendingPaintFrame: number | undefined

  const openList = (): HTMLUListElement | undefined => (props.open() ? props.list() : undefined)

  const readGeometry = (): RailGeometry | undefined => {
    const root = props.root()
    const header = props.header()
    if (!root || !header) return undefined
    const gutter = Number.parseFloat(getComputedStyle(root).getPropertyValue('--chat-trace-gutter'))
    if (!(gutter > 0)) return undefined
    const rootRect = root.getBoundingClientRect()
    if (rootRect.height === 0) return undefined
    const rows = renderedRows(openList())
    const top = header.getBoundingClientRect().top - rootRect.top
    return {
      gutter,
      top,
      headerAnchor: top + gutter / 2,
      rowAnchors: rows.map((row) => row.getBoundingClientRect().top - rootRect.top + gutter / 2),
      runningRowIndex: rows.findIndex((row) => row.hasAttribute('data-trace-live')),
      height: rootRect.height,
    }
  }

  const drawRail = (geometry: RailGeometry, paths: RailPaths): void => {
    if (!railSvg || !spineLine || !armTicks) return
    sizeSvg(railSvg, geometry)
    spineLine.setAttribute('d', paths.spine)
    armTicks.setAttribute('d', paths.arms)
  }

  const drawRunSegment = (geometry: RailGeometry, paths: RailPaths): void => {
    if (!runSvg || !runLine) return
    sizeSvg(runSvg, geometry)
    runLine.setAttribute('d', paths.spine)
    const connector = inboundConnectorOfRunningRow(geometry)
    if (!connector) {
      runSvg.style.opacity = '0'
      return
    }
    runSvg.style.setProperty('--rail-top', `${connector.from}px`)
    runSvg.style.setProperty('--rail-bottom', `${connector.to}px`)
    runSvg.style.opacity = '1'
  }

  const draw = (): void => {
    const geometry = readGeometry()
    if (!geometry) return
    const paths = railPaths(geometry)
    drawRail(geometry, paths)
    drawRunSegment(geometry, paths)
  }

  const scheduleReflow = (): void => {
    if (pendingReflowFrame !== undefined) return
    pendingReflowFrame = requestAnimationFrame(() => {
      pendingReflowFrame = undefined
      runSvg?.style.setProperty('--rail-travel', '0ms')
      draw()
      requestAnimationFrame(() => {
        runSvg?.style.removeProperty('--rail-travel')
      })
    })
  }

  const schedulePaint = (): void => {
    if (pendingPaintFrame !== undefined) return
    pendingPaintFrame = requestAnimationFrame(() => {
      pendingPaintFrame = undefined
      draw()
    })
  }

  onCleanup(() => {
    if (pendingReflowFrame !== undefined) cancelAnimationFrame(pendingReflowFrame)
    if (pendingPaintFrame !== undefined) cancelAnimationFrame(pendingPaintFrame)
  })

  onMount(() => {
    runSvg?.style.setProperty('transition', 'none')
    draw()
    runSvg?.getBoundingClientRect()
    requestAnimationFrame(() => {
      runSvg?.style.removeProperty('transition')
    })
    createResizeObserver(() => props.root(), scheduleReflow)
    createResizeObserver(() => props.list(), scheduleReflow)
  })

  createEffect(() => {
    props.open()
    draw()
  })

  createEffect(() => {
    props.liveKey()
    schedulePaint()
  })

  return (
    <>
      <svg ref={(element) => (railSvg = element)} aria-hidden="true" class={SVG_CLASS}>
        <path ref={(element) => (spineLine = element)} d="" class={PATH_CLASS} />
        <path ref={(element) => (armTicks = element)} d="" class={PATH_CLASS} />
      </svg>
      <svg ref={(element) => (runSvg = element)} aria-hidden="true" class={RUN_SVG_CLASS} style={{opacity: 0}}>
        <path ref={(element) => (runLine = element)} d="" class={RUN_PATH_CLASS} />
      </svg>
    </>
  )
}
