import {createSignal, For, onMount, Show, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider} from '../../../store/chat-context.js'
import {storyConnection} from '../../../store/story-connection.js'
import {Composer} from '../composer.js'
import type {DirectiveFormatter, TriggerAdapter, TriggerItem} from './types.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/Composer/TriggerPopoverAsync'}
export default meta
type Story = StoryObj

const slashFormatter: DirectiveFormatter = {
  serialize: (item) => `/${item.id}`,
  parse: (text) => [{kind: 'text', text}],
}

function adapterFor(items: () => readonly TriggerItem[]): TriggerAdapter {
  return {
    categories: () => [],
    categoryItems: () => [],
    search: (query) => items().filter((item) => item.id.includes(query.toLowerCase())),
  }
}

function App(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  const [items, setItems] = createSignal<readonly TriggerItem[]>([])
  onMount(() => {
    setTimeout(() => setItems([{id: 'compact', type: 'command', label: '/compact'}]), 100)
  })
  return (
    <ChatProvider chat={chat}>
      <Composer.TriggerPopoverRoot>
        <Composer.Root class="flex flex-col gap-1 relative">
          <Show when={items().length > 0}>
            <Composer.TriggerPopover char="/" adapter={adapterFor(items)} class="border flex flex-col">
              <Composer.TriggerPopover.Directive formatter={slashFormatter} />
              <Composer.TriggerPopoverItems>
                {(visible) => (
                  <For each={visible()}>
                    {(item, index) => (
                      <Composer.TriggerPopoverItem item={item} index={index()}>
                        {item.label}
                      </Composer.TriggerPopoverItem>
                    )}
                  </For>
                )}
              </Composer.TriggerPopoverItems>
            </Composer.TriggerPopover>
          </Show>
          <Composer.Input aria-label="Message" />
        </Composer.Root>
      </Composer.TriggerPopoverRoot>
    </ChatProvider>
  )
}

export const AsyncMountedTrigger: Story = {
  render: () => <App />,
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Message')
    await new Promise((resolve) => setTimeout(resolve, 250))
    await userEvent.type(input, '/comp')
    await waitFor(() => expect(canvas.getByRole('option', {name: '/compact'})).toBeVisible())
  },
}
