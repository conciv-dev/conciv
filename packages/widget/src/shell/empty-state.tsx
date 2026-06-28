// The empty chat state (greeting + starter prompts). An extension paints the 'empty' slot above it.
import {For, type Component, type JSX} from 'solid-js'
import {ExtensionSurface, type ExtensionHostBag, type ExtensionInstance} from '../extension/extension-slots.js'

const STARTERS = ['Explain this page', 'Change the primary color', "Why doesn't this layout fit?"]

const DefaultEmptyState: Component<{onStarter: (text: string) => void}> = (props) => (
  <div class="m-auto text-center">
    <p class="text-[1.125rem] tracking-[-0.015em] font-semibold mb-3.5 anim-rise-d">How can I help you today?</p>
    <div class="flex flex-col gap-2">
      <For each={STARTERS}>
        {(s, i) => (
          <button
            type="button"
            class="text-[0.8125rem] text-pw-text px-3.5 py-2.5 border border-pw-line rounded-pw-pill bg-transparent min-h-9.5 cursor-pointer trans-input anim-rise hover:border-pw-accent hover:bg-pw-accent-08 active:scale-[0.97]"
            style={{'animation-delay': `${100 + i() * 60}ms`}}
            onClick={() => props.onStarter(s)}
          >
            {s}
          </button>
        )}
      </For>
    </div>
  </div>
)

export function EmptyStateSlot(props: {
  onStarter: (text: string) => void
  instances: ExtensionInstance[]
  bag: ExtensionHostBag
}): JSX.Element {
  return (
    <>
      <ExtensionSurface name="empty" instances={props.instances} bag={props.bag} />
      <DefaultEmptyState onStarter={props.onStarter} />
    </>
  )
}
