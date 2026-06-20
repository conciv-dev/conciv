// The empty chat state (greeting + starter prompts) and its override seam: ui.setEmptyState(factory)
// stores a replacement in a signal; EmptyStateSlot renders the override if set, else the default.
// Named, concretely-typed setter (Pi-style), not a generic id registry.
import {createSignal, For, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {EmptyStateProps, EmptyStateFactory} from '@mandarax/extensions'

const STARTERS = ['Explain this page', 'Change the primary color', "Why doesn't this layout fit?"]

export const DefaultEmptyState: Component<EmptyStateProps> = (props) => (
  <div class="m-auto text-center">
    <p class="text-[1.125rem] tracking-[-0.015em] font-semibold mb-3.5 anim-rise-d">How can I help you today?</p>
    <div class="flex flex-col gap-2">
      <For each={STARTERS}>
        {(s, i) => (
          <button
            type="button"
            class="text-[0.8125rem] text-pw-text px-3.5 py-2.5 border border-pw-line rounded-pw-pill min-h-9.5 cursor-pointer bg-transparent anim-rise trans-input hover:border-pw-accent hover:bg-pw-accent-08 active:scale-[0.97]"
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

const [override, setOverride] = createSignal<EmptyStateFactory | null>(null)
export const setEmptyStateOverride = (factory: EmptyStateFactory | null): void => {
  setOverride(() => factory)
}

export function EmptyStateSlot(props: {onStarter: (text: string) => void}): JSX.Element {
  return <Dynamic component={override() ?? DefaultEmptyState} onStarter={props.onStarter} />
}
