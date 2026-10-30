import {createMemo, For, Match, Show, Switch, type JSX} from 'solid-js'
import type {StatusDotTone} from '@conciv/ui-kit-system'
import type {Box, TargetRecord} from '../shared/types.js'
import type {Delta, Row, XrayImages} from './data.js'

export const MODES = ['side', 'swipe', 'onion', 'toggle', 'diff'] as const
export type Mode = (typeof MODES)[number]

export type StageView = {
  boxes: boolean
  rulers: boolean
  swipe: number
  onion: number
  mask: number
  showing: 'live' | 'target'
  missing: string[]
}

type StageProps = {
  mode: Mode
  rows: Row[]
  selected: Row | null
  images: XrayImages
  target: TargetRecord
  view: StageView
  onMissing: (src: string) => void
}

type Ruler = {x1: number; y1: number; x2: number; y2: number; text: string}

const STROKE: Record<StatusDotTone, string> = {
  idle: 'stroke-chat-text-3',
  working: 'stroke-chat-success',
  accent: 'stroke-chat-accent',
  success: 'stroke-chat-success',
  warn: 'stroke-chat-warn',
  danger: 'stroke-chat-danger',
}

const PANE =
  'relative m-0 inline-block shrink-0 overflow-hidden rounded-chat-surface-md bg-chat-ground shadow-chat-lg outline outline-1 outline-chat-line -outline-offset-1'
const CAPTION =
  'absolute left-2 top-2 z-3 font-chat-mono text-[0.625rem] leading-none tracking-wider uppercase text-chat-text bg-chat-glass border border-chat-line py-1 px-1.5 rounded-chat-chip'
const LAYER = 'absolute inset-0 block size-full max-w-none'
const LABEL_CHAR_PX = 7.2
const LABEL_PAD_PX = 12
const LABEL_H = 18
const CAPTION_CLEAR = 30
const RULER_LABEL_W = 68
const RULER_LABEL_H = 20
const RULER_LABEL_GAP = 10
const RULER_TEXT_BASELINE = 14
const HORIZONTAL_SIDES = ['left', 'right', 'x']
const DASH = '6 4'

type Edge = {start: number; size: number}

function span(input: {live: Edge; target: Edge; far: boolean; distance: number}): [number, number] {
  const from = input.far ? input.live.start + input.live.size : input.live.start
  const other = input.far ? input.target.start + input.target.size : input.target.start
  const step = input.far ? -input.distance : input.distance
  const to = other === from ? from + step : other
  return [Math.min(from, to), Math.max(from, to)]
}

function measurable(delta: Delta): boolean {
  return delta.side !== undefined && typeof delta.live === 'number' && typeof delta.target === 'number'
}

function measure(row: Row): Ruler | null {
  const delta = row.deltas.find(measurable)
  const live = row.live
  if (delta === undefined || delta.side === undefined || live === null) return null
  const target = row.target ?? live
  const far = delta.side === 'right' || delta.side === 'bottom'
  const distance = Math.abs(Number(delta.live) - Number(delta.target))
  const text = `${delta.live} → ${delta.target}`
  if (HORIZONTAL_SIDES.includes(delta.side)) {
    const [x1, x2] = span({
      live: {start: live.x, size: live.w},
      target: {start: target.x, size: target.w},
      far,
      distance,
    })
    const y = live.y + live.h / 2
    return {x1, x2, y1: y, y2: y, text}
  }
  const [y1, y2] = span({live: {start: live.y, size: live.h}, target: {start: target.y, size: target.h}, far, distance})
  const x = live.x + live.w / 2
  return {x1: x, x2: x, y1, y2, text}
}

function within(input: {value: number; size: number; limit: number}): number {
  return Math.max(0, Math.min(input.value, input.limit - input.size))
}

function labelTop(input: {box: Box; height: number}): number {
  const {box} = input
  const above = box.y - LABEL_H - 2
  if (above >= CAPTION_CLEAR) return above
  return within({value: Math.max(box.y + 2, CAPTION_CLEAR), size: LABEL_H, limit: input.height})
}

function labelWidth(text: string): number {
  return text.length * LABEL_CHAR_PX + LABEL_PAD_PX
}

function rulerLabel(input: {line: Ruler; target: TargetRecord}): {x: number; y: number} {
  const {line, target} = input
  return {
    x: within({value: (line.x1 + line.x2) / 2 - RULER_LABEL_W / 2, size: RULER_LABEL_W, limit: target.width}),
    y: within({value: line.y2 + RULER_LABEL_GAP, size: RULER_LABEL_H, limit: target.height}),
  }
}

function Overlay(props: {rows: Row[]; selected: Row | null; view: StageView; target: TargetRecord}): JSX.Element {
  const ruler = () => (props.view.rulers && props.selected !== null ? measure(props.selected) : null)
  return (
    <svg
      class="size-full pointer-events-none inset-0 absolute z-2"
      viewBox={`0 0 ${props.target.width} ${props.target.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <Show when={props.view.boxes}>
        <For each={props.rows}>
          {(row) => {
            const chosen = () => props.selected?.key === row.key
            const weight = () => (chosen() ? 'stroke-2 opacity-100' : 'stroke-[1.5] opacity-60')
            return (
              <>
                <Show when={row.target}>
                  {(box) => (
                    <rect
                      class={`fill-none ${STROKE[row.tone]}  ${weight()}`}
                      x={box().x}
                      y={box().y}
                      width={box().w}
                      height={box().h}
                      stroke-dasharray={DASH}
                      vector-effect="non-scaling-stroke"
                    />
                  )}
                </Show>
                <Show when={row.live}>
                  {(box) => (
                    <rect
                      class={`fill-none ${STROKE[row.tone]}  ${weight()}`}
                      x={box().x}
                      y={box().y}
                      width={box().w}
                      height={box().h}
                      stroke-dasharray={row.unmatched === null ? undefined : DASH}
                      vector-effect="non-scaling-stroke"
                    />
                  )}
                </Show>
                <Show when={chosen() && row.live}>
                  {(box) => {
                    const left = () => within({value: box().x, size: labelWidth(row.label), limit: props.target.width})
                    const top = () => labelTop({box: box(), height: props.target.height})
                    return (
                      <>
                        <rect
                          class="fill-chat-accent"
                          x={left()}
                          y={top()}
                          width={labelWidth(row.label)}
                          height={LABEL_H}
                          rx={3}
                        />
                        <text
                          class="text-[11px] font-chat-mono fill-chat-on-accent"
                          x={left() + 6}
                          y={top() + LABEL_H - 5}
                        >
                          {row.label}
                        </text>
                      </>
                    )
                  }}
                </Show>
              </>
            )
          }}
        </For>
      </Show>
      <Show when={ruler()}>
        {(line) => {
          const label = createMemo(() => rulerLabel({line: line(), target: props.target}))
          return (
            <g class="stroke-chat-danger">
              <line x1={line().x1} y1={line().y1} x2={line().x2} y2={line().y2} vector-effect="non-scaling-stroke" />
              <rect
                class="fill-chat-danger stroke-none"
                x={label().x}
                y={label().y}
                width={RULER_LABEL_W}
                height={RULER_LABEL_H}
                rx={3}
              />
              <text
                class="text-[12px] font-chat-mono fill-chat-on-accent stroke-none"
                x={label().x + RULER_LABEL_W / 2}
                y={label().y + RULER_TEXT_BASELINE}
                text-anchor="middle"
              >
                {line().text}
              </text>
            </g>
          )
        }}
      </Show>
    </svg>
  )
}

function Pane(props: {caption: string; children: JSX.Element; overlay: JSX.Element}): JSX.Element {
  return (
    <figure class={PANE}>
      <figcaption class={CAPTION}>{props.caption}</figcaption>
      {props.children}
      {props.overlay}
    </figure>
  )
}

export function Stage(props: StageProps): JSX.Element {
  const usable = (src: string | null) => (src === null || props.view.missing.includes(src) ? null : src)
  const live = () => usable(props.images.live)
  const overlay = () => <Overlay rows={props.rows} selected={props.selected} view={props.view} target={props.target} />
  const base = (alt: string, src: string) => (
    <img
      class="max-w-none block"
      src={src}
      alt={alt}
      width={props.target.width}
      height={props.target.height}
      onError={() => props.onMissing(src)}
    />
  )
  const layer = (input: {alt: string; src: string; style?: JSX.CSSProperties}) => (
    <img class={LAYER} src={input.src} alt={input.alt} style={input.style} onError={() => props.onMissing(input.src)} />
  )
  const failed = (src: string | null) => src !== null && props.view.missing.includes(src)
  const notices = (): [boolean, string][] => [
    [failed(props.images.target), 'The target image could not be loaded; register the target again.'],
    [props.images.live === null, 'No diff has run for this width yet; the stage shows the target alone.'],
    [failed(props.images.live), 'The live capture of this run was pruned; run the diff again to see it.'],
    [
      props.mode === 'diff' && failed(props.images.diff),
      'The diff image of this run was pruned; run the diff again to see it.',
    ],
  ]
  const notice = () => notices().find(([shown]) => shown)?.[1] ?? null
  return (
    <div class="flex flex-col gap-3">
      <Show when={notice()}>
        {(text) => (
          <p role="status" class="text-[0.75rem] text-chat-text-2 m-0">
            {text()}
          </p>
        )}
      </Show>
      <Show
        when={live()}
        fallback={
          <Pane caption="target" overlay={overlay()}>
            {base('target design', props.images.target)}
          </Pane>
        }
      >
        {(src) => (
          <Switch>
            <Match when={props.mode === 'side'}>
              <div class="flex gap-4 items-start">
                <Pane caption="live" overlay={overlay()}>
                  {base('live capture', src())}
                </Pane>
                <Pane caption="target" overlay={overlay()}>
                  {base('target design', props.images.target)}
                </Pane>
              </div>
            </Match>
            <Match when={props.mode === 'swipe'}>
              <Pane caption="live ◂ ▸ target" overlay={overlay()}>
                {base('target design', props.images.target)}
                {layer({
                  alt: 'live capture',
                  src: src(),
                  style: {'clip-path': `inset(0 ${100 - props.view.swipe}% 0 0)`},
                })}
                <span class="bg-chat-accent w-0.5 inset-y-0 absolute z-1" style={{left: `${props.view.swipe}%`}} />
              </Pane>
            </Match>
            <Match when={props.mode === 'onion'}>
              <Pane caption="onion" overlay={overlay()}>
                {base('target design', props.images.target)}
                {layer({alt: 'live capture', src: src(), style: {opacity: 1 - props.view.onion / 100}})}
              </Pane>
            </Match>
            <Match when={props.mode === 'toggle'}>
              <Pane caption={props.view.showing} overlay={overlay()}>
                {base('target design', props.images.target)}
                <Show when={props.view.showing === 'live'}>{layer({alt: 'live capture', src: src()})}</Show>
              </Pane>
            </Match>
            <Match when={props.mode === 'diff'}>
              <Pane caption="changed pixels over live" overlay={overlay()}>
                {base('live capture', src())}
                <Show when={usable(props.images.diff)}>
                  {(diff) => layer({alt: 'changed pixels', src: diff(), style: {opacity: props.view.mask / 100}})}
                </Show>
              </Pane>
            </Match>
          </Switch>
        )}
      </Show>
    </div>
  )
}
