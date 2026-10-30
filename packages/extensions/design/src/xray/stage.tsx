import {For, Match, Show, Switch, type JSX} from 'solid-js'
import type {StatusDotTone} from '@conciv/ui-kit-system'
import type {TargetRecord} from '../shared/types.js'
import type {Row, XrayImages} from './data.js'

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
const RULER_LABEL_W = 68
const HORIZONTAL_SIDES = ['left', 'right', 'x']
const DASH = '6 4'

function measure(row: Row): Ruler | null {
  const delta = row.deltas.find(
    (candidate) =>
      candidate.side !== undefined && typeof candidate.live === 'number' && typeof candidate.target === 'number',
  )
  const live = row.live
  if (delta === undefined || delta.side === undefined || live === null) return null
  const span = Math.abs(Number(delta.live) - Number(delta.target))
  const text = `${delta.live} → ${delta.target}`
  const target = row.target ?? live
  const far = delta.side === 'right' || delta.side === 'bottom'
  if (HORIZONTAL_SIDES.includes(delta.side)) {
    const from = far ? live.x + live.w : live.x
    const other = far ? target.x + target.w : target.x
    const to = other === from ? from + (far ? -span : span) : other
    const y = live.y + live.h / 2
    return {x1: Math.min(from, to), x2: Math.max(from, to), y1: y, y2: y, text}
  }
  const from = far ? live.y + live.h : live.y
  const other = far ? target.y + target.h : target.y
  const to = other === from ? from + (far ? -span : span) : other
  const x = live.x + live.w / 2
  return {x1: x, x2: x, y1: Math.min(from, to), y2: Math.max(from, to), text}
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
                  {(box) => (
                    <>
                      <rect
                        class="fill-chat-accent"
                        x={box().x}
                        y={box().y - 20}
                        width={row.label.length * LABEL_CHAR_PX + LABEL_PAD_PX}
                        height={18}
                        rx={3}
                      />
                      <text class="text-[11px] font-chat-mono fill-chat-on-accent" x={box().x + 6} y={box().y - 7}>
                        {row.label}
                      </text>
                    </>
                  )}
                </Show>
              </>
            )
          }}
        </For>
      </Show>
      <Show when={ruler()}>
        {(line) => (
          <g class="stroke-chat-danger">
            <line x1={line().x1} y1={line().y1} x2={line().x2} y2={line().y2} vector-effect="non-scaling-stroke" />
            <rect
              class="fill-chat-danger stroke-none"
              x={(line().x1 + line().x2) / 2 - RULER_LABEL_W / 2}
              y={line().y2 + 10}
              width={RULER_LABEL_W}
              height={20}
              rx={3}
            />
            <text
              class="text-[12px] font-chat-mono fill-chat-on-accent stroke-none"
              x={(line().x1 + line().x2) / 2}
              y={line().y2 + 24}
              text-anchor="middle"
            >
              {line().text}
            </text>
          </g>
        )}
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
  const notice = () => {
    if (props.images.live === null) return 'No diff has run for this width yet; the stage shows the target alone.'
    return live() === null ? 'The live capture of this run was pruned; run the diff again to see it.' : null
  }
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
