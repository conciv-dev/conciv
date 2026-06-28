import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider} from '../../store/chat-context.js'
import {storyConnection} from '../../store/story-connection.js'
import {Composer} from './composer.js'
import {ComposerHandlersProvider, type TriggerItem} from './composer-handlers.js'

const meta: Meta = {title: 'primitives/Composer/TriggerPopover'}
export default meta
type Story = StoryObj

const MENTIONS: TriggerItem[] = [
  {id: 'claude', label: '@claude', insert: '@claude '},
  {id: 'page', label: '@page', insert: '@page '},
]

function App(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  return (
    <ComposerHandlersProvider value={{triggerItems: (query) => MENTIONS.filter((item) => item.label.includes(query))}}>
      <ChatProvider chat={chat}>
        <Composer.Root class="flex flex-col gap-1 relative">
          <Composer.Input aria-label="Message" placeholder="Type @ to mention" />
          <Composer.TriggerPopover class="border border-pw-line rounded-pw-sm bg-pw-panel flex flex-col" />
        </Composer.Root>
      </ChatProvider>
    </ComposerHandlersProvider>
  )
}

export const MentionTrigger: Story = {
  render: () => <App />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const input = c.getByLabelText('Message')
    await userEvent.type(input, 'ping @cl')
    await waitFor(() => expect(c.getByRole('option', {name: '@claude'})).toBeVisible())
    await userEvent.click(c.getByRole('option', {name: '@claude'}))
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toContain('@claude'))
  },
}
