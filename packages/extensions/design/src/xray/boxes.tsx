import {For, Show, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import type {createXrayData} from './data.js'
import {createLiveRect} from './live-rect.js'

type Data = ReturnType<typeof createXrayData>

type Entry = ReturnType<Data['boxes']>[number]

export function Boxes(props: {data: Data}): JSX.Element {
  return (
    <Show when={props.data.shown('design')}>
      <div
        role="group"
        aria-label="Design x-ray boxes"
        class="pointer-events-none inset-0 fixed"
        data-conciv-key="Jwmpcw"
      >
        <For each={props.data.boxes()}>{(entry) => <Placed entry={entry} data={props.data} />}</For>
      </div>
    </Show>
  )
}

function Placed(props: {entry: Entry; data: Data}): JSX.Element {
  const placed = createLiveRect({selector: () => props.entry.selector, stored: () => props.entry.box})
  const hue = () => hueOf(props.entry.magnitude)
  const hovered = () => props.data.hovered() === props.entry.node
  const selected = () => props.data.picked() === props.entry.node
  const tinted = () => FILLED.has(props.entry.magnitude ?? '') || hovered() || selected()
  const pick = () => {
    if (!props.data.pick()) return
    props.data.pickNode(props.entry.node)
    props.data.setPick(false)
  }
  return (
    <>
      <Button
        variant="plain"
        size="none"
        aria-label={`${props.entry.name} ${props.entry.node}`}
        aria-current={selected() ? 'true' : undefined}
        data-hover={hovered() ? '' : undefined}
        tabIndex={props.data.pick() ? 0 : -1}
        class={`p-0 focus-ring fixed ${props.data.pick() ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
        onClick={pick}
        onPointerEnter={() => props.data.hover(props.entry.node)}
        onPointerLeave={() => props.data.hover(null)}
        style={{
          left: px(placed().box.x),
          top: px(placed().box.y),
          width: px(placed().box.w),
          height: px(placed().box.h),
          background: tinted() ? `color-mix(in oklch, ${hue()} 10%, transparent)` : 'transparent',
          'border-width': STROKE,
          'border-style': placed().rendered ? 'solid' : 'dashed',
          'border-color': hue(),
        }}
        data-conciv-key="q0bBGg"
      />
      <span
        class="text-[length:var(--chat-text-xs)] text-chat-on-accent px-1.5 py-px rounded-chat-chip flex gap-1.5 pointer-events-none whitespace-nowrap items-center fixed"
        style={{left: px(placed().box.x), top: px(placed().box.y), transform: LIFT, background: hue()}}
        data-conciv-key="CA-bnQ"
      >
        <span class="font-semibold" data-conciv-key="UpjDAA">
          {props.entry.name}
        </span>
        <span class="font-chat-mono font-normal" data-conciv-key="UQS9dQ">
          {props.entry.node}
        </span>
      </span>
    </>
  )
}

const FILLED = new Set(['noticeably', 'paint'])

const STROKE = 'calc(var(--chat-space) * 0.375)'

const LIFT = 'translateY(calc(-100% - var(--chat-space) * 0.5))'

function px(value: number): string {
  return `${value}px`
}

function hueOf(magnitude: string | null): string {
  return `var(--xray-${magnitude ?? 'matched'}, var(--chat-dim))`
}
