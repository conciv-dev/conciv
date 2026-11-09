import {For, Show, type JSX} from 'solid-js'
import type {createXrayData} from './data.js'

export function Boxes(props: {data: ReturnType<typeof createXrayData>}): JSX.Element {
  return (
    <Show when={props.data.shown('design')}>
      <div
        role="group"
        aria-label="Design x-ray boxes"
        class="pointer-events-none inset-0 fixed"
        data-conciv-key="Jwmpcw"
      >
        <For each={props.data.boxes()}>
          {(entry) => (
            <button
              type="button"
              aria-label={`${entry.name} ${entry.node}`}
              tabIndex={props.data.pick() ? 0 : -1}
              class={`p-0 bg-transparent fixed ${props.data.pick() ? 'pointer-events-auto cursor-pointer' : ''}`}
              onClick={() => props.data.pick() && props.data.pickNode(entry.node)}
              style={{
                left: `${entry.box.x}px`,
                top: `${entry.box.y}px`,
                width: `${entry.box.w}px`,
                height: `${entry.box.h}px`,
                border: `calc(var(--chat-space) * 0.375) solid ${hueOf(entry.magnitude)}`,
                background: FILLED.has(entry.magnitude ?? '')
                  ? `color-mix(in oklch, ${hueOf(entry.magnitude)} 10%, transparent)`
                  : undefined,
              }}
              data-conciv-key="T8vA3w"
            >
              <span
                class="text-[length:var(--chat-text-xs)] text-chat-on-accent mb-0.5 px-1.5 py-px rounded-chat-chip flex gap-1.5 whitespace-nowrap items-center bottom-full absolute"
                style={{background: hueOf(entry.magnitude)}}
                data-conciv-key="CA-bnQ"
              >
                <span class="font-semibold" data-conciv-key="UpjDAA">
                  {entry.name}
                </span>
                <span class="font-normal" data-conciv-key="UQS9dQ">
                  {entry.node}
                </span>
              </span>
            </button>
          )}
        </For>
      </div>
    </Show>
  )
}

const FILLED = new Set(['noticeably', 'paint'])

function hueOf(magnitude: string | null): string {
  return `var(--xray-${magnitude ?? 'matched'}, var(--chat-dim))`
}
