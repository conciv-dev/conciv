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

function writeAttribute(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) === value) return
  element.setAttribute(name, value)
}

function writeStyleProperty(element: SVGElement, name: string, value: string): void {
  if (element.style.getPropertyValue(name) === value) return
  element.style.setProperty(name, value)
}

function sizeSvg(svg: SVGSVGElement, geometry: RailGeometry): void {
  writeAttribute(svg, 'width', `${geometry.gutter}`)
  writeAttribute(svg, 'height', `${geometry.height}`)
}

type MeasuredRow = {row: HTMLElement; top: number}

function measuredRows(list: HTMLUListElement | undefined): MeasuredRow[] {
  if (!list) return []
  return Array.from(list.querySelectorAll(':scope > li'))
    .filter((row): row is HTMLElement => row instanceof HTMLElement)
    .map((row) => ({row, rect: row.getBoundingClientRect()}))
    .filter(({rect}) => rect.height > 0)
    .map(({row, rect}) => ({row, top: rect.top}))
}

function geometryKey(geometry: RailGeometry): string {
  const {gutter, top, height, runningRowIndex, rowAnchors} = geometry
  return `${gutter}|${top}|${height}|${runningRowIndex}|${rowAnchors.join(',')}`
}

function gutterToken(root: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(root).getPropertyValue('--chat-trace-gutter'))
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
  let pendingFrame: number | undefined
  let pendingReflow = false
  let drawnKey: string | undefined

  const openList = (): HTMLUListElement | undefined => (props.open() ? props.list() : undefined)

  const readGeometry = (): RailGeometry | undefined => {
    const root = props.root()
    const header = props.header()
    if (!root || !header) return undefined
    const gutter = gutterToken(root)
    if (!(gutter > 0)) return undefined
    const rootRect = root.getBoundingClientRect()
    if (rootRect.height === 0) return undefined
    const rows = measuredRows(openList())
    const top = header.getBoundingClientRect().top - rootRect.top
    return {
      gutter,
      top,
      headerAnchor: top + gutter / 2,
      rowAnchors: rows.map(({top: rowTop}) => rowTop - rootRect.top + gutter / 2),
      runningRowIndex: rows.findIndex(({row}) => row.hasAttribute('data-trace-live')),
      height: rootRect.height,
    }
  }

  const drawRail = (geometry: RailGeometry, paths: RailPaths): void => {
    if (!railSvg || !spineLine || !armTicks) return
    sizeSvg(railSvg, geometry)
    writeAttribute(spineLine, 'd', paths.spine)
    writeAttribute(armTicks, 'd', paths.arms)
  }

  const drawRunSegment = (geometry: RailGeometry, paths: RailPaths): void => {
    if (!runSvg || !runLine) return
    sizeSvg(runSvg, geometry)
    writeAttribute(runLine, 'd', paths.spine)
    const connector = inboundConnectorOfRunningRow(geometry)
    if (!connector) {
      writeStyleProperty(runSvg, 'opacity', '0')
      return
    }
    writeStyleProperty(runSvg, '--rail-top', `${connector.from}px`)
    writeStyleProperty(runSvg, '--rail-bottom', `${connector.to}px`)
    writeStyleProperty(runSvg, 'opacity', '1')
  }

  const draw = (): void => {
    const geometry = readGeometry()
    if (!geometry) return
    const key = geometryKey(geometry)
    if (key === drawnKey) return
    drawnKey = key
    const paths = railPaths(geometry)
    drawRail(geometry, paths)
    drawRunSegment(geometry, paths)
  }

  const schedule = (reflow: boolean): void => {
    pendingReflow = pendingReflow || reflow
    if (pendingFrame !== undefined) return
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = undefined
      const settlesInPlace = pendingReflow
      pendingReflow = false
      if (settlesInPlace) runSvg?.style.setProperty('--rail-travel', '0ms')
      draw()
      if (!settlesInPlace) return
      requestAnimationFrame(() => {
        runSvg?.style.removeProperty('--rail-travel')
      })
    })
  }

  const observeResize = (): void => {
    schedule(true)
  }

  onCleanup(() => {
    if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame)
  })

  onMount(() => {
    runSvg?.style.setProperty('transition', 'none')
    draw()
    runSvg?.getBoundingClientRect()
    requestAnimationFrame(() => {
      runSvg?.style.removeProperty('transition')
    })
    createResizeObserver(() => [props.root(), props.list()], observeResize)
  })

  createEffect(() => {
    props.open()
    draw()
  })

  createEffect(() => {
    props.liveKey()
    schedule(false)
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
