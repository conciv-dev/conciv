import {onMount, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../store/chat-context.js'
import {storyConnection} from '../store/story-connection.js'
import {Thread} from '../primitives/thread/thread.js'
import {Message} from '../primitives/message/message.js'
import {AssistantActionBar} from './action-bar.js'

const meta: Meta = {title: 'styled/ActionBar'}
export default meta
type Story = StoryObj

const REPLY: UIMessage = {
  id: 'a1',
  role: 'assistant',
  parts: [{type: 'text', content: 'Add the missing await on line 12.'}],
}

function AssistantMessage(): JSX.Element {
  return (
    <Message.Root class="flex flex-col gap-1 [color:var(--chat-text)] self-start">
      <Message.Parts />
      <AssistantActionBar />
    </Message.Root>
  )
}

function Frame(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  onMount(() => chat.setMessages([REPLY]))
  return (
    <div class="p-3 w-96 [background:var(--chat-bg)]">
      <ChatProvider chat={chat}>
        <Thread.Root>
          <Thread.Viewport>
            <Thread.Messages components={{AssistantMessage}} />
          </Thread.Viewport>
        </Thread.Root>
      </ChatProvider>
    </div>
  )
}

export const CopyAndExport: Story = {
  render: () => <Frame />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    // The settled last turn's bar is visible (autohide=not-last, isLast → shown). waitFor lets the
    // bar's presence-in animation settle before the visibility assertion.
    const copy = await waitFor(() => c.getByRole('button', {name: 'Copy'}))
    await waitFor(() => expect(copy).toBeVisible())
    await expect(copy).not.toHaveAttribute('data-copied')
    await userEvent.click(copy)
    // After copying, the headless data-copied flag flips (drives the Swap to the check).
    await waitFor(() => expect(c.getByRole('button', {name: 'Copy'})).toHaveAttribute('data-copied'))
    // The overflow menu opens to the Export action.
    await userEvent.click(c.getByRole('button', {name: 'More'}))
    await waitFor(() => expect(c.getByText('Export as Markdown')).toBeVisible())
    // Refresh (reload) is present too.
    await expect(c.getByRole('button', {name: 'Refresh'})).toBeInTheDocument()
  },
}
