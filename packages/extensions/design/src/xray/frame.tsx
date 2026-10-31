import {For, Show, type JSX} from 'solid-js'

export const FRAME_BAR_PX = 28
export const FRAME_BORDER_PX = 1

const DOTS = [0, 1, 2]

type FrameProps = {
  label: string
  route: string
  width: number
  height: number
  scale: number
  ready: boolean
  failure: string | null
  children: JSX.Element
}

export function Frame(props: FrameProps): JSX.Element {
  return (
    <figure class="m-0 border border-chat-line rounded-chat-surface-md bg-chat-ground flex shrink-0 flex-col shadow-chat-lg overflow-hidden">
      <figcaption class="px-2.5 border-b border-chat-line bg-chat-panel gap-2 grid grid-cols-[1fr_minmax(0,auto)_1fr] h-7 items-center">
        <span class="flex gap-1.5" aria-hidden="true">
          <For each={DOTS}>{() => <span class="rounded-chat-pill bg-chat-text-3 opacity-40 size-2" />}</For>
        </span>
        <span class="text-[0.75rem] text-chat-text-3 leading-5 px-2.5 rounded-chat-pill bg-chat-fill truncate tabular-nums">
          {props.label} · {props.route} · {props.width}
        </span>
      </figcaption>
      <div
        class={`relative overflow-hidden ${props.ready ? 'bg-chat-ground' : 'bg-chat-fill'}`}
        style={{width: `${props.width * props.scale}px`, height: `${props.height * props.scale}px`}}
      >
        <Show when={props.failure} fallback={props.children}>
          {(text) => (
            <p class="text-[0.8125rem] text-chat-text-2 m-0 p-6 text-center grid size-full text-pretty place-items-center">
              {text()}
            </p>
          )}
        </Show>
      </div>
    </figure>
  )
}
