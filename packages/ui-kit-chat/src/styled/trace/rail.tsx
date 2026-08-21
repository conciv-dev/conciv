import {createEffect, onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {createResizeObserver} from '@solid-primitives/resize-observer'

const CORNER_RADIUS = 3

const RAIL_CLASS =
  'absolute [inset-block:0] [inset-inline-start:0] w-[var(--chat-trace-gutter)] pointer-events-none rtl:-scale-x-100 origin-center'
const BASE_CLASS = 'absolute inset-0 [background:var(--chat-glyph)]'
const THUMB_CLASS =
  'absolute [inset-inline:0] [top:var(--rail-top,0px)] [height:var(--rail-height,0px)] [opacity:var(--rail-o,0)] [background:var(--chat-accent)] [transition:top_var(--rail-travel,320ms)_var(--chat-ease),height_var(--rail-travel,320ms)_var(--chat-ease),opacity_260ms_var(--chat-ease)] motion-reduce:[transition:none]'

function spineX(gutter: number): number {
  return Math.round(gutter / 2) + 0.5
}

type RailGeometry = {gutter: number; top: number; headerAnchor: number; rowAnchors: number[]}

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

export function railMask(paths: RailPaths, width: number, height: number): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path d="${paths.spine}" stroke="black" stroke-width="1" fill="none"/><path d="${paths.arms}" stroke="black" stroke-width="1" fill="none"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(markup)}")`
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
  let rail: HTMLDivElement | undefined
  let thumb: HTMLDivElement | undefined
  let pendingMeasureFrame: number | undefined
  let pendingPaintFrame: number | undefined
  let anchors: number[] = []
  let maskCache = ''

  const visibleRows = (): HTMLUListElement | undefined => (props.open() ? props.list() : undefined)

  const measure = (): void => {
    const root = props.root()
    const header = props.header()
    if (!root || !header || !rail) return
    const gutter = Number.parseFloat(getComputedStyle(root).getPropertyValue('--chat-trace-gutter'))
    if (!(gutter > 0)) return
    const rootRect = root.getBoundingClientRect()
    if (rootRect.height === 0) return
    const top = header.getBoundingClientRect().top - rootRect.top
    const geometry = {
      gutter,
      top,
      headerAnchor: top + gutter / 2,
      rowAnchors: readRowAnchors(visibleRows(), rootRect.top, gutter),
    }
    anchors = [geometry.headerAnchor, ...geometry.rowAnchors]
    const mask = railMask(jointsRail(geometry), gutter, rootRect.height)
    if (mask === maskCache) return
    maskCache = mask
    rail.style.setProperty('mask-image', mask)
  }

  const paint = (): void => {
    if (!thumb) return
    const index = liveRowIndex(visibleRows())
    const enteredAnchor = index < 0 ? undefined : anchors[index]
    const liveAnchor = index < 0 ? undefined : anchors[index + 1]
    if (enteredAnchor !== undefined && liveAnchor !== undefined) {
      thumb.style.setProperty('--rail-top', `${enteredAnchor}px`)
      thumb.style.setProperty('--rail-height', `${liveAnchor - enteredAnchor}px`)
      thumb.style.setProperty('--rail-o', '1')
      return
    }
    thumb.style.setProperty('--rail-o', '0')
  }

  const scheduleMeasure = (): void => {
    if (pendingMeasureFrame !== undefined) return
    pendingMeasureFrame = requestAnimationFrame(() => {
      pendingMeasureFrame = undefined
      thumb?.style.setProperty('--rail-travel', '0ms')
      measure()
      paint()
      requestAnimationFrame(() => {
        thumb?.style.removeProperty('--rail-travel')
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
    thumb?.style.setProperty('transition', 'none')
    measure()
    paint()
    thumb?.getBoundingClientRect()
    requestAnimationFrame(() => {
      thumb?.style.removeProperty('transition')
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
    <div ref={(element) => (rail = element)} aria-hidden="true" class={RAIL_CLASS}>
      <div class={BASE_CLASS} />
      <div ref={(element) => (thumb = element)} class={THUMB_CLASS} />
    </div>
  )
}
