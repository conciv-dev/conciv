import {createEffect, onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {createResizeObserver} from '@solid-primitives/resize-observer'

const CORNER_RADIUS = 3

const SVG_CLASS =
  'absolute [inset-block-start:0] [inset-inline-start:0] w-[var(--chat-trace-gutter)] pointer-events-none rtl:-scale-x-100 origin-center'
const PATH_CLASS = '[stroke:var(--chat-glyph)] stroke-1 fill-none'
const RUN_TRAVEL =
  '[transition:translate_var(--rail-travel,var(--chat-duration-slow))_var(--chat-ease)] motion-reduce:[transition:none]'
const RUN_FADE_CLASS =
  'absolute [inset-block-start:0] [inset-inline-start:0] w-[var(--chat-trace-gutter)] h-0 pointer-events-none [transition:opacity_var(--chat-duration-slow)_var(--chat-ease)] motion-reduce:[transition:none]'
const RUN_WINDOW =
  'absolute [inset-inline-start:0] w-[var(--chat-trace-gutter)] h-[var(--rail-height,0px)] overflow-hidden'
const RUN_BOTTOM_CLASS = `${RUN_WINDOW} [inset-block-end:0] [translate:0_var(--rail-bottom,0px)] ${RUN_TRAVEL}`
const RUN_TOP_CLASS = `${RUN_WINDOW} [inset-block-start:100%] [translate:0_calc(var(--rail-top,0px)-var(--rail-bottom,0px))] ${RUN_TRAVEL}`
const RUN_SHIFT_CLASS = `absolute [inset-block-start:0] [inset-inline-start:0] [translate:0_calc(-1*var(--rail-top,0px))] ${RUN_TRAVEL}`
const RUN_PATH_CLASS = '[stroke:var(--chat-accent)] stroke-1 fill-none'

function spineX(gutter: number): number {
  return Math.round(gutter / 2) + 0.5
}

type RailGeometry = {
  gutter: number
  top: number
  headerAnchor: number | undefined
  rowAnchors: number[]
  runningRowIndex: number
  height: number
  joinsBelow: boolean
}

type RailPaths = {spine: string; arms: string}

type InboundConnector = {from: number; to: number}

function railPaths(geometry: RailGeometry): RailPaths {
  const {gutter, top, headerAnchor, rowAnchors, height, joinsBelow} = geometry
  const lastRowAnchor = rowAnchors[rowAnchors.length - 1]
  if (lastRowAnchor === undefined) return {spine: '', arms: ''}
  const x = spineX(gutter)
  const headerArm = headerAnchor === undefined ? [] : [headerAnchor]
  const armAnchors = [...headerArm, ...(joinsBelow ? rowAnchors : rowAnchors.slice(0, -1))]
  const arms = armAnchors.map((y) => `M ${x} ${y} L ${gutter} ${y}`).join(' ')
  if (joinsBelow) return {spine: `M ${x} ${top} L ${x} ${height}`, arms}
  return {
    spine: `M ${x} ${top} L ${x} ${lastRowAnchor - CORNER_RADIUS} A ${CORNER_RADIUS} ${CORNER_RADIUS} 0 0 0 ${x + CORNER_RADIUS} ${lastRowAnchor} L ${gutter} ${lastRowAnchor}`,
    arms,
  }
}

function inboundConnectorOfRunningRow(geometry: RailGeometry): InboundConnector | undefined {
  const rowIndex = geometry.runningRowIndex
  const to = geometry.rowAnchors[rowIndex]
  if (to === undefined) return undefined
  const from = rowIndex === 0 ? (geometry.headerAnchor ?? geometry.top) : geometry.rowAnchors[rowIndex - 1]
  return from === undefined ? undefined : {from, to}
}

function writeAttribute(element: Element, name: string, value: string): void {
  if (element.getAttribute(name) === value) return
  element.setAttribute(name, value)
}

function writeStyleProperty(element: HTMLElement, name: string, value: string): void {
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
  const {gutter, top, height, runningRowIndex, rowAnchors, joinsBelow} = geometry
  return `${gutter}|${top}|${height}|${runningRowIndex}|${joinsBelow}|${rowAnchors.join(',')}`
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
  joinsBelow: Accessor<boolean>
}): JSX.Element {
  let railSvg: SVGSVGElement | undefined
  let spineLine: SVGPathElement | undefined
  let armTicks: SVGPathElement | undefined
  let runFade: HTMLDivElement | undefined
  let runSvg: SVGSVGElement | undefined
  let runLine: SVGPathElement | undefined
  let pendingFrame: number | undefined
  let travelFrame: number | undefined
  let drawnKey: string | undefined

  const openList = (): HTMLUListElement | undefined => (props.open() ? props.list() : undefined)

  const readGeometry = (): RailGeometry | undefined => {
    const root = props.root()
    const header = props.header()
    if (!root) return undefined
    const gutter = gutterToken(root)
    if (!(gutter > 0)) return undefined
    const rootRect = root.getBoundingClientRect()
    if (rootRect.height === 0) return undefined
    const rows = measuredRows(openList())
    const top = header ? header.getBoundingClientRect().top - rootRect.top : 0
    return {
      gutter,
      top,
      headerAnchor: header ? top + gutter / 2 : undefined,
      rowAnchors: rows.map(({top: rowTop}) => rowTop - rootRect.top + gutter / 2),
      runningRowIndex: rows.findIndex(({row}) => row.hasAttribute('data-trace-live')),
      height: rootRect.height,
      joinsBelow: props.joinsBelow(),
    }
  }

  const drawRail = (geometry: RailGeometry, paths: RailPaths): void => {
    if (!railSvg || !spineLine || !armTicks) return
    sizeSvg(railSvg, geometry)
    writeAttribute(spineLine, 'd', paths.spine)
    writeAttribute(armTicks, 'd', paths.arms)
  }

  const drawRunSegment = (geometry: RailGeometry, paths: RailPaths): void => {
    if (!runFade || !runSvg || !runLine) return
    sizeSvg(runSvg, geometry)
    writeAttribute(runLine, 'd', paths.spine)
    writeStyleProperty(runFade, '--rail-height', `${geometry.height}px`)
    const connector = inboundConnectorOfRunningRow(geometry)
    if (!connector) {
      writeStyleProperty(runFade, 'opacity', '0')
      return
    }
    writeStyleProperty(runFade, '--rail-top', `${connector.from}px`)
    writeStyleProperty(runFade, '--rail-bottom', `${connector.to}px`)
    writeStyleProperty(runFade, 'opacity', '1')
  }

  const draw = (beforeWrite?: () => void): void => {
    const geometry = readGeometry()
    if (!geometry) return
    const key = geometryKey(geometry)
    if (key === drawnKey) return
    drawnKey = key
    beforeWrite?.()
    const paths = railPaths(geometry)
    drawRail(geometry, paths)
    drawRunSegment(geometry, paths)
  }

  const schedule = (): void => {
    if (pendingFrame !== undefined) return
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = undefined
      draw()
    })
  }

  const settleTravel = (): void => {
    runFade?.style.setProperty('--rail-travel', '0ms')
    if (travelFrame !== undefined) return
    travelFrame = requestAnimationFrame(() => {
      travelFrame = undefined
      runFade?.style.removeProperty('--rail-travel')
    })
  }

  const observeResize = (): void => {
    draw(settleTravel)
  }

  onCleanup(() => {
    if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame)
    if (travelFrame !== undefined) cancelAnimationFrame(travelFrame)
  })

  onMount(() => {
    runFade?.style.setProperty('transition', 'none')
    runFade?.style.setProperty('--rail-travel', '0ms')
    draw()
    runFade?.getBoundingClientRect()
    requestAnimationFrame(() => {
      runFade?.style.removeProperty('transition')
      runFade?.style.removeProperty('--rail-travel')
    })
    createResizeObserver(() => [props.root(), props.list()], observeResize)
  })

  createEffect(() => {
    props.open()
    props.joinsBelow()
    draw()
  })

  createEffect(() => {
    props.liveKey()
    schedule()
  })

  return (
    <>
      <svg ref={(element) => (railSvg = element)} aria-hidden="true" class={SVG_CLASS}>
        <path ref={(element) => (spineLine = element)} d="" class={PATH_CLASS} />
        <path ref={(element) => (armTicks = element)} d="" class={PATH_CLASS} />
      </svg>
      <div ref={(element) => (runFade = element)} aria-hidden="true" class={RUN_FADE_CLASS} style={{opacity: 0}}>
        <div class={RUN_BOTTOM_CLASS}>
          <div class={RUN_TOP_CLASS}>
            <div class={RUN_SHIFT_CLASS}>
              <svg ref={(element) => (runSvg = element)} class={SVG_CLASS}>
                <path ref={(element) => (runLine = element)} d="" class={RUN_PATH_CLASS} />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
