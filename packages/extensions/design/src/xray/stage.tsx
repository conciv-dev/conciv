import {For, onCleanup, onMount, Show, type JSX} from 'solid-js'
import {clamp} from 'es-toolkit'
import {ScrollArea, Tooltip, TooltipIconButton} from '@conciv/ui-kit-system'
import type {TargetRecord} from '../shared/types.js'
import type {Row, XrayImages} from './data.js'
import {Frame} from './frame.js'
import {CheckChip, RadioChip} from './panel.js'

export const MODES = ['live', 'design', 'diff', 'side', 'slider'] as const
export type Mode = (typeof MODES)[number]

const MODE_ICON: Record<Mode, string> = {
  live: 'i-ph-browser-duotone',
  design: 'i-ph-pen-nib-duotone',
  diff: 'i-ph-git-diff-duotone',
  side: 'i-ph-columns-duotone',
  slider: 'i-ph-arrows-left-right-duotone',
}

const MODE_LABEL: Record<Mode, string> = {
  live: 'Live',
  design: 'Design',
  diff: 'Diff',
  side: 'Side by side',
  slider: 'Slider',
}

export type Canvas = {width: number; gap: number; border: number; overflow: boolean}

export type StageView = {
  boxes: boolean
  zoom: number | null
  slider: number
  canvas: Canvas
  loaded: string[]
  failed: string[]
  hovered: string | null
}

type StageActions = {
  zoom: (scale: number | null) => void
  slide: (value: number) => void
  measure: (canvas: Canvas) => void
  loaded: (src: string) => void
  failed: (src: string) => void
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const MIN_FIT = 0.05
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const STEP_EPSILON = 0.001
const WHEEL_RATE = 0.01
const NUDGE = 1
const NUDGE_LARGE = 10
const DASH = '4 3'
const NUDGE_KEYS: Record<string, number> = {ArrowLeft: -1, ArrowRight: 1}

const ZOOM_PERCENT = new Intl.NumberFormat(undefined, {style: 'percent', maximumFractionDigits: 0})

const FAILURE = {
  design: 'The target image could not be loaded; register the target again.',
  live: 'The live capture of this run was pruned; run the diff again to see it.',
  diff: 'The diff image of this run was pruned; run the diff again to see it.',
}

function frameCount(mode: Mode): number {
  return mode === 'side' ? 2 : 1
}

export function fitScale(input: {canvas: Canvas; target: TargetRecord; mode: Mode}): number {
  const frames = frameCount(input.mode)
  const chrome = frames * input.canvas.border + (frames - 1) * input.canvas.gap
  return clamp((input.canvas.width - chrome) / (frames * input.target.width), MIN_FIT, 1)
}

export function clampZoom(scale: number): number {
  return clamp(scale, MIN_ZOOM, MAX_ZOOM)
}

export function zoomStep(input: {scale: number; direction: 1 | -1}): number {
  if (input.direction === 1) return ZOOM_STEPS.find((step) => step > input.scale + STEP_EPSILON) ?? MAX_ZOOM
  return ZOOM_STEPS.findLast((step) => step < input.scale - STEP_EPSILON) ?? MIN_ZOOM
}

type ToolbarProps = {
  mode: Mode
  ran: boolean
  scale: number
  fitted: boolean
  boxes: boolean
  onMode: (mode: Mode) => void
  onZoom: (direction: 1 | -1) => void
  onToggleZoom: () => void
  onBoxes: (on: boolean) => void
}

export function StageToolbar(props: ToolbarProps): JSX.Element {
  return (
    <div class="p-2 border-b border-base flex flex-wrap gap-2 min-w-0 items-center">
      <div role="radiogroup" aria-label="Mode" class="flex flex-wrap gap-2 items-center">
        <For each={MODES}>
          {(mode) => (
            <RadioChip
              group="mode"
              small
              checked={props.mode === mode}
              disabled={!props.ran && mode !== 'design'}
              icon={MODE_ICON[mode]}
              onSelect={() => props.onMode(mode)}
            >
              {MODE_LABEL[mode]}
            </RadioChip>
          )}
        </For>
      </div>
      <div role="group" aria-label="Zoom" class="flex gap-1 items-center">
        <TooltipIconButton
          tooltip="Zoom out"
          class="btn-icon-compact"
          disabled={props.scale <= MIN_ZOOM}
          onClick={() => props.onZoom(-1)}
        >
          <span class="i-ph-magnifying-glass-minus-duotone" aria-hidden="true" />
        </TooltipIconButton>
        <button
          type="button"
          class="btn-action-sm min-w-14 justify-center tabular-nums"
          onClick={() => props.onToggleZoom()}
        >
          {props.fitted ? 'Fit' : ZOOM_PERCENT.format(props.scale)}
        </button>
        <TooltipIconButton
          tooltip="Zoom in"
          class="btn-icon-compact"
          disabled={props.scale >= MAX_ZOOM}
          onClick={() => props.onZoom(1)}
        >
          <span class="i-ph-magnifying-glass-plus-duotone" aria-hidden="true" />
        </TooltipIconButton>
      </div>
      <div class="ms-auto">
        <CheckChip
          checked={props.boxes}
          icon="i-ph-bounding-box-duotone"
          label="Boxes"
          onToggle={(on) => props.onBoxes(on)}
        />
      </div>
    </div>
  )
}

function Outline(props: {row: Row; class: string}): JSX.Element {
  const box = () => props.row.live ?? props.row.target
  return (
    <Show when={box()}>
      {(shape) => (
        <rect
          class={`fill-none ${props.class}`}
          x={shape().x}
          y={shape().y}
          width={shape().w}
          height={shape().h}
          stroke-dasharray={props.row.unmatched === 'missing' ? DASH : undefined}
          vector-effect="non-scaling-stroke"
        />
      )}
    </Show>
  )
}

function Overlay(props: {
  rows: Row[]
  selected: Row | null
  hovered: string | null
  boxes: boolean
  target: TargetRecord
}): JSX.Element {
  const hovering = (row: Row) => props.hovered === row.key && props.selected?.key !== row.key
  return (
    <svg
      class="size-full pointer-events-none inset-0 absolute"
      viewBox={`0 0 ${props.target.width} ${props.target.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <Show when={props.boxes}>
        <For each={props.rows}>{(row) => <Outline row={row} class="opacity-50 stroke-neutral-400" />}</For>
      </Show>
      <For each={props.rows}>
        {(row) => (
          <Outline
            row={row}
            class={`transition-opacity stroke-[1.5] stroke-primary-500 motion-reduce:transition-none ${hovering(row) ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
      </For>
      <Show when={props.selected}>{(row) => <Outline row={row()} class="stroke-[1.5] stroke-primary-500" />}</Show>
    </svg>
  )
}

type DividerEvent = PointerEvent & {currentTarget: HTMLDivElement}

function Divider(props: {value: number; onChange: (value: number) => void}): JSX.Element {
  const follow = (event: DividerEvent) => {
    const body = event.currentTarget.parentElement
    if (body === null) return
    const rect = body.getBoundingClientRect()
    props.onChange(clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100))
  }
  const nudge = (event: KeyboardEvent) => {
    const step = event.shiftKey ? NUDGE_LARGE : NUDGE
    const direction = NUDGE_KEYS[event.key]
    if (direction === undefined) return
    event.preventDefault()
    props.onChange(clamp(props.value + direction * step, 0, 100))
  }
  return (
    <Tooltip.Root>
      <Tooltip.Context>
        {(api) => (
          <div
            role="separator"
            tabindex="0"
            aria-orientation="vertical"
            aria-label="Live and design divider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(props.value)}
            class="group outline-none w-4 cursor-ew-resize inset-y-0 absolute touch-none -translate-x-1/2"
            style={{left: `${props.value}%`}}
            onPointerDown={(event) => {
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              follow(event)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) follow(event)
            }}
            onKeyDown={nudge}
            onFocus={(event) => event.currentTarget.matches(':focus-visible') && api().setOpen(true)}
            onBlur={() => api().setOpen(false)}
          >
            <span class="bg-neutral-900 w-0.5 inset-y-0 left-1/2 absolute -translate-x-1/2" aria-hidden="true" />
            <Tooltip.Trigger
              asChild={(triggerProps) => (
                <span
                  {...triggerProps()}
                  class="border border-base rounded-full bg-base grid size-7 shadow-sm left-1/2 top-1/2 place-items-center absolute group-focus-visible:ring-2 group-focus-visible:ring-primary-500/40 -translate-x-1/2 -translate-y-1/2"
                  aria-hidden="true"
                >
                  <span class="i-ph-arrows-out-line-horizontal size-4" />
                </span>
              )}
            />
          </div>
        )}
      </Tooltip.Context>
      <Tooltip.Positioner>
        <Tooltip.Content>Live and design divider</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}

type StageProps = {
  mode: Mode
  rows: Row[]
  selected: Row | null
  images: XrayImages
  target: TargetRecord
  view: StageView
  scale: number
  fitted: boolean
  actions: StageActions
}

type Pan = {x: number; y: number; left: number; top: number}

export function Stage(props: StageProps): JSX.Element {
  const held: {pan: Pan | null; viewport?: HTMLDivElement; padded?: HTMLDivElement; row?: HTMLDivElement} = {
    pan: null,
  }
  const failed = (src: string | null) => src === null || props.view.failed.includes(src)
  const measure = () => {
    const {viewport, padded, row} = held
    if (viewport === undefined || padded === undefined || row === undefined) return
    const padding = getComputedStyle(padded)
    const frame = row.firstElementChild
    const edges = frame === null ? null : getComputedStyle(frame)
    props.actions.measure({
      width: viewport.clientWidth - Number.parseFloat(padding.paddingLeft) - Number.parseFloat(padding.paddingRight),
      gap: Number.parseFloat(getComputedStyle(row).columnGap) || 0,
      border: edges === null ? 0 : Number.parseFloat(edges.borderLeftWidth) + Number.parseFloat(edges.borderRightWidth),
      overflow: padded.offsetWidth > viewport.clientWidth || padded.offsetHeight > viewport.clientHeight,
    })
  }
  onMount(() => {
    const observer = new ResizeObserver(measure)
    if (held.viewport !== undefined) observer.observe(held.viewport)
    if (held.padded !== undefined) observer.observe(held.padded)
    onCleanup(() => observer.disconnect())
  })
  const zoomAround = (input: {scale: number; x: number; y: number; viewport: HTMLElement}) => {
    const content = held.row
    if (content === undefined) {
      props.actions.zoom(input.scale)
      return
    }
    const before = content.getBoundingClientRect()
    const ratio = input.scale / props.scale
    props.actions.zoom(input.scale)
    const after = content.getBoundingClientRect()
    input.viewport.scrollLeft += after.left + (input.x - before.left) * ratio - input.x
    input.viewport.scrollTop += after.top + (input.y - before.top) * ratio - input.y
  }
  const ready = (src: string | null) => src !== null && props.view.loaded.includes(src)
  const Picture = (picture: {src: string | null; alt: string; style?: JSX.CSSProperties}) => (
    <Show when={picture.src}>
      {(src) => (
        <img
          class="size-full max-w-none block inset-0 absolute"
          src={src()}
          alt={picture.alt}
          draggable={false}
          style={picture.style}
          onLoad={() => props.actions.loaded(src())}
          onError={() => props.actions.failed(src())}
        />
      )}
    </Show>
  )
  const Shot = (shot: {label: string; src: string | null; failure: string | null; children: JSX.Element}) => (
    <Frame
      label={shot.label}
      route={props.target.route}
      width={props.target.width}
      height={props.target.height}
      scale={props.scale}
      ready={ready(shot.src)}
      failure={shot.failure}
    >
      {shot.children}
      <Overlay
        rows={props.rows}
        selected={props.selected}
        hovered={props.view.hovered}
        boxes={props.view.boxes}
        target={props.target}
      />
    </Frame>
  )
  const DesignShot = () => (
    <Shot label="Design" src={props.images.target} failure={failed(props.images.target) ? FAILURE.design : null}>
      <Picture src={props.images.target} alt="Design" />
    </Shot>
  )
  const LiveShot = () => (
    <Shot label="Live" src={props.images.live} failure={failed(props.images.live) ? FAILURE.live : null}>
      <Picture src={props.images.live} alt="Live capture" />
    </Shot>
  )
  const sliderFailure = () => {
    if (failed(props.images.target)) return FAILURE.design
    return failed(props.images.live) ? FAILURE.live : null
  }
  return (
    <ScrollArea.Root class="flex-1 min-h-0 relative">
      <ScrollArea.Viewport
        ref={(element) => {
          held.viewport = element
        }}
        class={`overscroll-contain bg-secondary size-full select-none ${props.view.canvas.overflow ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return
          event.preventDefault()
          zoomAround({
            scale: clampZoom(props.scale * Math.exp(-event.deltaY * WHEEL_RATE)),
            x: event.clientX,
            y: event.clientY,
            viewport: event.currentTarget,
          })
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !props.view.canvas.overflow) return
          event.currentTarget.setPointerCapture(event.pointerId)
          held.pan = {
            x: event.clientX,
            y: event.clientY,
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          }
        }}
        onPointerMove={(event) => {
          const pan = held.pan
          if (pan === null) return
          event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x)
          event.currentTarget.scrollTop = pan.top - (event.clientY - pan.y)
        }}
        onPointerUp={() => {
          held.pan = null
        }}
        onPointerCancel={() => {
          held.pan = null
        }}
        onDblClick={() => props.actions.zoom(props.fitted ? 1 : null)}
      >
        <ScrollArea.Content
          ref={(element) => {
            held.padded = element
          }}
          class="p-4 grid min-h-full w-full place-items-center"
        >
          <div
            ref={(element) => {
              held.row = element
            }}
            class="flex gap-6 items-start"
          >
            <Show when={props.mode === 'live'}>
              <LiveShot />
            </Show>
            <Show when={props.mode === 'design'}>
              <DesignShot />
            </Show>
            <Show when={props.mode === 'diff'}>
              <Shot label="Diff" src={props.images.diff} failure={failed(props.images.diff) ? FAILURE.diff : null}>
                <Picture src={props.images.diff} alt="Changed pixels" />
              </Shot>
            </Show>
            <Show when={props.mode === 'side'}>
              <DesignShot />
              <LiveShot />
            </Show>
            <Show when={props.mode === 'slider'}>
              <Shot label="Live over design" src={props.images.target} failure={sliderFailure()}>
                <Picture src={props.images.target} alt="Design" />
                <Picture
                  src={props.images.live}
                  alt="Live capture"
                  style={{'clip-path': `inset(0 ${100 - props.view.slider}% 0 0)`}}
                />
                <Divider value={props.view.slider} onChange={(value) => props.actions.slide(value)} />
              </Shot>
            </Show>
          </div>
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical">
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>
      <ScrollArea.Scrollbar orientation="horizontal">
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  )
}
