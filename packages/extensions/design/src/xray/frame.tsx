import {For, Show, type JSX} from 'solid-js'

const DOTS = [0, 1, 2]

type FrameProps = {
  label: string
  route?: string
  width: number
  height: number
  scale: number
  ready: boolean
  failure: string | null
  children: JSX.Element
}

export function Frame(props: FrameProps): JSX.Element {
  return (
    <figure class="m-0 border border-base rounded-lg bg-base flex shrink-0 flex-col overflow-hidden">
      <figcaption class="px-2.5 border-b border-base bg-base gap-2 grid grid-cols-[1fr_minmax(0,auto)_1fr] h-7 items-center">
        <span class="flex gap-1.5" aria-hidden="true">
          <For each={DOTS}>{() => <span class="rounded-full bg-neutral-400 opacity-40 size-2" />}</For>
        </span>
        <span class="text-xs color-meta leading-5 px-2.5 rounded-full bg-active truncate tabular-nums">
          {props.label} · {props.route} · {props.width}
        </span>
      </figcaption>
      <div
        class={`relative overflow-hidden ${props.ready ? 'bg-base' : 'bg-active'}`}
        style={{width: `${props.width * props.scale}px`, height: `${props.height * props.scale}px`}}
      >
        <Show when={props.failure} fallback={props.children}>
          {(text) => (
            <p class="text-sm m-0 p-6 text-center op-fade grid size-full text-pretty place-items-center">{text()}</p>
          )}
        </Show>
      </div>
    </figure>
  )
}
