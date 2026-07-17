import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider} from '../../store/chat-context.js'
import {storyConnection, createTextChunks} from '../../store/story-connection.js'
import {AssistantModal} from './assistant-modal.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/AssistantModal'}
export default meta
type Story = StoryObj

export const TriggerOpensPanel: Story = {
  render: () => (
    <AssistantModal.Root>
      <AssistantModal.Trigger class="text-pw-on-accent rounded-pw-pill bg-pw-accent size-10">AI</AssistantModal.Trigger>
      <AssistantModal.Content class="p-3 w-72">
        <div class="text-[0.8125rem] text-pw-text">The chat panel lives here.</div>
      </AssistantModal.Content>
    </AssistantModal.Root>
  ),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('AI'))
    await waitFor(() => expect(c.getByText('The chat panel lives here.')).toBeVisible())
  },
}

function RunStartFrame(): JSX.Element {
  const chat = useChat({connection: storyConnection({chunks: createTextChunks('Working on it.'), chunkDelay: 5})})
  return (
    <ChatProvider chat={chat}>
      <button type="button" onClick={() => void chat.sendMessage('go')}>
        start run
      </button>
      <AssistantModal.Root openOnRunStart>
        <AssistantModal.Trigger class="text-pw-on-accent rounded-pw-pill bg-pw-accent size-10">
          AI
        </AssistantModal.Trigger>
        <AssistantModal.Content class="p-3 w-72">
          <div class="text-[0.8125rem] text-pw-text">Panel opened by the run.</div>
        </AssistantModal.Content>
      </AssistantModal.Root>
    </ChatProvider>
  )
}

export const OpensOnRunStart: Story = {
  render: () => <RunStartFrame />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await expect(c.getByText('Panel opened by the run.')).not.toBeVisible()
    await userEvent.click(c.getByText('start run'))

    await waitFor(() => expect(c.getByText('Panel opened by the run.')).toBeVisible())
  },
}
