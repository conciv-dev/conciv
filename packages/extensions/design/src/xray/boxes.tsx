import {createMemo, For, Show, type JSX} from 'solid-js'
import {groupBy, sortBy} from 'es-toolkit'
import type {createXrayData} from './data.js'

type Data = ReturnType<typeof createXrayData>

type Entry = ReturnType<Data['boxes']>[number]

export function Boxes(props: {data: Data}): JSX.Element {
  const parts = createMemo(() => partsOf(props.data.boxes()))
  return (
    <Show when={props.data.shown('design')}>
      <div
        role="group"
        aria-label="Design x-ray boxes"
        class="pointer-events-none inset-0 fixed"
        data-conciv-key="Jwmpcw"
      >
        <For each={parts()}>
          {(part) => (
            <Show when={part.length > 1} fallback={<Single entry={part[0]} data={props.data} />}>
              <Row entries={part} data={props.data} />
            </Show>
          )}
        </For>
      </div>
    </Show>
  )
}

function Single(props: {entry: Entry | undefined; data: Data}): JSX.Element {
  return (
    <Show when={props.entry}>
      {(entry) => (
        <>
          <BoxFrame
            entry={entry()}
            data={props.data}
            class="fixed"
            at={{left: px(entry().box.x), top: px(entry().box.y)}}
          />
          <Label
            entry={entry()}
            class="fixed"
            at={{left: px(entry().box.x), top: px(entry().box.y), transform: LIFT}}
          />
        </>
      )}
    </Show>
  )
}

function Row(props: {entries: Entry[]; data: Data}): JSX.Element {
  const first = () => props.entries[0]
  const left = () => first()?.box.x ?? 0
  const top = () => first()?.box.y ?? 0
  const gap = () => (props.entries[1]?.box.x ?? 0) - left() - (first()?.box.w ?? 0)
  const columns = () =>
    props.entries
      .map((entry, index) => {
        const next = props.entries[index + 1]
        return next === undefined ? 'auto' : px(next.box.x - entry.box.x)
      })
      .join(' ')
  return (
    <>
      <div
        class="flex pointer-events-none fixed"
        style={{left: px(left()), top: px(top()), gap: px(gap())}}
        data-conciv-key="WnMO5Q"
      >
        <For each={props.entries}>
          {(entry) => <BoxFrame entry={entry} data={props.data} class="shrink-0 relative" />}
        </For>
      </div>
      <div
        class="grid w-max pointer-events-none fixed"
        style={{left: px(left()), top: px(top()), 'grid-template-columns': columns(), transform: LIFT}}
        data-conciv-key="CXaxLQ"
      >
        <For each={props.entries}>{(entry) => <Label entry={entry} />}</For>
      </div>
    </>
  )
}

function BoxFrame(props: {entry: Entry; data: Data; class: string; at?: JSX.CSSProperties}): JSX.Element {
  const hue = () => hueOf(props.entry.magnitude)
  const filled = () => FILLED.has(props.entry.magnitude ?? '')
  const pickable = () => (props.data.pick() ? 'pointer-events-auto cursor-pointer' : '')
  const size = () => ({width: px(props.entry.box.w), height: px(props.entry.box.h)})
  const pick = () => {
    if (!props.data.pick()) return
    props.data.pickNode(props.entry.node)
    props.data.setPick(false)
  }
  return (
    <Show
      when={filled()}
      fallback={
        <svg
          role="button"
          aria-label={`${props.entry.name} ${props.entry.node}`}
          tabIndex={props.data.pick() ? 0 : -1}
          class={`block ${props.class}  ${pickable()}`}
          onClick={pick}
          style={{...props.at, ...size()}}
          data-conciv-key="T8vA3w"
        >
          <rect
            style={{
              x: `calc(${STROKE} / 2)`,
              y: `calc(${STROKE} / 2)`,
              width: `calc(100% - ${STROKE})`,
              height: `calc(100% - ${STROKE})`,
              fill: 'none',
              stroke: hue(),
              'stroke-width': STROKE,
            }}
            data-conciv-key="e_IGzQ"
          />
        </svg>
      }
    >
      <button
        type="button"
        aria-label={`${props.entry.name} ${props.entry.node}`}
        tabIndex={props.data.pick() ? 0 : -1}
        class={`p-0 border-0 bg-transparent ${props.class}  ${pickable()}`}
        onClick={pick}
        style={{
          ...props.at,
          ...size(),
          background: `color-mix(in oklch, ${hue()} 10%, transparent)`,
          'border-width': FILLED_STROKE,
          'border-style': 'solid',
          'border-color': hue(),
        }}
        data-conciv-key="q0bBGg"
      />
    </Show>
  )
}

function Label(props: {entry: Entry; class?: string; at?: JSX.CSSProperties}): JSX.Element {
  return (
    <span
      class={`text-[length:var(--chat-text-xs)] text-chat-on-accent px-1.5 py-px rounded-chat-chip flex gap-1.5 pointer-events-none whitespace-nowrap items-center justify-self-start ${props.class ?? ''}`}
      style={{...props.at, background: hueOf(props.entry.magnitude)}}
      data-conciv-key="CA-bnQ"
    >
      <span class="font-semibold" data-conciv-key="UpjDAA">
        {props.entry.name}
      </span>
      <span class="font-chat-mono font-normal" data-conciv-key="UQS9dQ">
        {props.entry.node}
      </span>
    </span>
  )
}

function partsOf(entries: Entry[]): Entry[][] {
  const lines = Object.values(groupBy(entries, (entry) => `${entry.box.y}:${entry.box.h}`)).map((line) =>
    sortBy(line, [(entry) => entry.box.x]),
  )
  return sortBy(lines, [(line) => line[0]?.box.y ?? 0, (line) => line[0]?.box.x ?? 0])
}

const FILLED = new Set(['noticeably', 'paint'])

const STROKE = 'calc(var(--chat-space) * 0.375)'

const FILLED_STROKE = 'calc(var(--chat-space) * 0.5)'

const LIFT = 'translateY(calc(-100% - var(--chat-space) * 0.5))'

function px(value: number): string {
  return `${value}px`
}

function hueOf(magnitude: string | null): string {
  return `var(--xray-${magnitude ?? 'matched'}, var(--chat-dim))`
}
