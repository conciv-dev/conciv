import {onMount, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {createChat} from '@conciv/ai/client'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {ChatProvider} from '../store/chat-context.js'
import {storyConnection, createTextChunks} from '@conciv/ai/testkit'
import type {SuggestionData} from '../primitives/suggestion/suggestion.js'
import {FollowUpSuggestions} from './follow-up-suggestions.js'

const meta: Meta = {title: 'ui-kit-chat/styled/FollowUpSuggestions'}
export default meta
type Story = StoryObj

const SUGGESTIONS: SuggestionData[] = [
  {title: 'Explain', label: 'explain', prompt: 'Explain the fix'},
  {title: 'Tests', label: 'tests', prompt: 'Add a test'},
]

const REPLY: ChatMessage = {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'Done.'}]}

function Frame(): JSX.Element {
  const chat = createChat({
    threadId: 'follow-up-suggestions',
    connection: storyConnection({chunks: createTextChunks('On it.'), chunkDelay: 3}),
  })
  onMount(() => chat.setMessages([REPLY]))
  return (
    <div class="p-3 w-96 [background:var(--chat-bg)]">
      <ChatProvider chat={chat}>
        <FollowUpSuggestions suggestions={SUGGESTIONS} />
      </ChatProvider>
    </div>
  )
}

export const SettledThreadShowsPills: Story = {
  render: () => <Frame />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByRole('button', {name: 'Explain the fix'})).toBeVisible())
    await expect(c.getByRole('button', {name: 'Add a test'})).toBeVisible()

    await userEvent.click(c.getByRole('button', {name: 'Explain the fix'}))
  },
}
