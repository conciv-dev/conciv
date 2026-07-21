import {For, type JSX} from 'solid-js'
import {ExtensionSurface, type ExtensionInstance} from '../extension/extension-slots.js'
import {useArrivedFromConnect} from '../app/context.js'

const STARTERS = ['Explain this page', 'Change the primary color', "Why doesn't this layout fit?"]
const CONNECT_HEADLINE = 'Agent connected. It’s driving this page from your machine.'
const DEFAULT_HEADLINE = 'How can I help you today?'

export function EmptyStateSlot(props: {
  onStarter: (text: string) => void
  instances: ExtensionInstance[]
}): JSX.Element {
  return (
    <>
      <ExtensionSurface name="empty" instances={props.instances} />
      <EmptyState onStarter={props.onStarter} />
    </>
  )
}

function EmptyState(props: {onStarter: (text: string) => void}): JSX.Element {
  const arrivedFromConnect = useArrivedFromConnect()
  return (
    <div class="m-auto text-center">
      <p class="text-[1.125rem] tracking-[-0.015em] font-semibold mb-3.5 anim-rise-d">
        {arrivedFromConnect() ? CONNECT_HEADLINE : DEFAULT_HEADLINE}
      </p>
      <div class="flex flex-col gap-2">
        <For each={STARTERS}>
          {(starter, index) => (
            <button
              type="button"
              class="text-[0.8125rem] text-pw-text px-3.5 py-2.5 border border-pw-line rounded-pw-pill bg-transparent min-h-9.5 cursor-pointer trans-input anim-rise hover:border-pw-accent hover:bg-pw-accent-08 active:scale-[0.97]"
              style={{'animation-delay': `${100 + index() * 60}ms`}}
              onClick={() => props.onStarter(starter)}
            >
              {starter}
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
