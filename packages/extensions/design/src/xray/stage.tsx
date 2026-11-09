import {For, Show, type JSX} from 'solid-js'
import type {createXrayData} from './data.js'

type Data = ReturnType<typeof createXrayData>

export function Stage(props: {data: Data}): JSX.Element {
  const target = () => props.data.design.latest?.target
  const share = (input: {value: number; whole: number | undefined}): string =>
    `${(input.value / (input.whole ?? input.value)) * 100}%`
  return (
    <div
      role="group"
      aria-label="Design x-ray stage"
      class="bg-chat-panel pointer-events-auto end-0 start-104 inset-y-0 fixed"
      data-conciv-key="StgRt1"
    >
      <For each={PLANES}>
        {(plane, index) => (
          <Show when={plane.always || props.data.plane(plane.key)}>
            <div
              class="border border-solid bg-chat-fill-soft h-65 w-202.5 start-65 absolute"
              style={{
                top: `calc(var(--chat-space) * (${PLANE_TOP} + ${PLANE_STEP} * ${index()}))`,
                'border-color': plane.hue,
                transform: SLANT,
                'transform-origin': 'bottom left',
              }}
              data-conciv-key="StgPl1"
            >
              <Show when={plane.key === 'dom'}>
                <For each={props.data.boxes()}>
                  {(entry) => (
                    <div
                      class="border border-solid absolute"
                      style={{
                        left: share({value: entry.box.x, whole: target()?.width}),
                        top: share({value: entry.box.y, whole: target()?.height}),
                        width: share({value: entry.box.w, whole: target()?.width}),
                        height: share({value: entry.box.h, whole: target()?.height}),
                        'border-color': `var(--xray-${entry.magnitude ?? 'matched'}, var(--chat-dim))`,
                      }}
                      data-conciv-key="StgBx1"
                    />
                  )}
                </For>
              </Show>
            </div>
            <span
              class="text-xs text-chat-text-hi font-semibold px-2 py-0.75 border border-chat-line rounded-full bg-chat-panel flex gap-1.5 whitespace-nowrap items-center start-50 absolute"
              style={{top: `calc(var(--chat-space) * (${LABEL_TOP} + ${PLANE_STEP} * ${index()}))`}}
              data-conciv-key="StgLb1"
            >
              <span class="rounded-full shrink-0 size-2" style={{background: plane.hue}} data-conciv-key="StgDt1" />
              <span data-conciv-key="StgTx1">{plane.label}</span>
            </span>
          </Show>
        )}
      </For>
      <span class="text-xs text-chat-text-3 whitespace-nowrap start-102 bottom-10.75 absolute" data-conciv-key="StgHn1">
        Drag to orbit · click a plane to focus it · Esc comes back
      </span>
    </div>
  )
}

const PLANE_TOP = 37.5

const LABEL_TOP = 99

const PLANE_STEP = 29.5

const SLANT = 'skewX(-33deg)'

const PLANES = [
  {key: 'src', always: false, hue: 'var(--chat-text-3)', label: 'SRC · source'},
  {key: 'cssom', always: false, hue: 'var(--chat-warn)', label: 'CSSOM · computed'},
  {key: 'dom', always: true, hue: 'var(--chat-agent)', label: 'DOM · live page'},
  {key: 'fom', always: true, hue: 'var(--chat-accent)', label: 'FOM · design'},
] as const
