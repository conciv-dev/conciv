import {onMount, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../../store/chat-context.js'
import {storyConnection} from '../../store/story-connection.js'
import {Thread} from '../thread/thread.js'
import {Message} from '../message/message.js'
import {ActionBar} from './action-bar.js'
import {ActionHandlersProvider} from './action-handlers.js'

const meta: Meta = {title: 'primitives/ActionBar'}
export default meta
type Story = StoryObj

const REPLY: UIMessage = {
  id: 'a1',
  role: 'assistant',
  parts: [{type: 'text', content: 'Add the missing await on line 12.'}],
}

function Bar(): JSX.Element {
  return (
    <ActionBar.Root class="flex gap-1">
      <ActionBar.Copy class="text-[0.6875rem] text-pw-text-2 px-1.5 py-0.5 border border-pw-line rounded-pw-sm">
        Copy
      </ActionBar.Copy>
      <ActionBar.Reload class="text-[0.6875rem] text-pw-text-2 px-1.5 py-0.5 border border-pw-line rounded-pw-sm">
        Retry
      </ActionBar.Reload>
      <ActionBar.ExportMarkdown class="text-[0.6875rem] text-pw-text-2 px-1.5 py-0.5 border border-pw-line rounded-pw-sm">
        Export
      </ActionBar.ExportMarkdown>
      <ActionBar.Edit class="text-[0.6875rem] text-pw-text-2 px-1.5 py-0.5 border border-pw-line rounded-pw-sm">
        Edit
      </ActionBar.Edit>
      <ActionBar.Speak class="text-[0.6875rem] text-pw-text-2 px-1.5 py-0.5 border border-pw-line rounded-pw-sm">
        Speak
      </ActionBar.Speak>
      <ActionBar.FeedbackPositive class="text-[0.6875rem] text-pw-text-2 px-1.5 py-0.5 border border-pw-line rounded-pw-sm">
        Good
      </ActionBar.FeedbackPositive>
    </ActionBar.Root>
  )
}

function AssistantMessage(): JSX.Element {
  return (
    <Message.Root class="text-pw-text flex flex-col gap-1 self-start">
      <Message.Parts />
      <Bar />
    </Message.Root>
  )
}

function Frame(props: {handlers?: boolean}): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  onMount(() => chat.setMessages([REPLY]))
  const handlers = props.handlers ? {onEdit: () => {}, onSpeak: () => {}, onFeedback: () => {}} : {}
  return (
    <ActionHandlersProvider value={handlers}>
      <ChatProvider chat={chat}>
        <Thread.Root>
          <Thread.Viewport>
            <Thread.Messages components={{AssistantMessage}} />
          </Thread.Viewport>
        </Thread.Root>
      </ChatProvider>
    </ActionHandlersProvider>
  )
}

export const LiveActionsOnly: Story = {
  render: () => <Frame />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByRole('button', {name: 'Copy'})).toBeVisible())
    await expect(c.getByRole('button', {name: 'Reload'})).toBeVisible()
    await expect(c.getByRole('button', {name: 'Export markdown'})).toBeVisible()
    // Gated actions render null without a handler.
    await expect(c.queryByRole('button', {name: 'Edit'})).toBeNull()
    await expect(c.queryByRole('button', {name: 'Speak'})).toBeNull()
    await expect(c.queryByRole('button', {name: 'Good response'})).toBeNull()
  },
}

export const GatedActionsLightUpWithHandlers: Story = {
  render: () => <Frame handlers />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByRole('button', {name: 'Edit'})).toBeVisible())
    await expect(c.getByRole('button', {name: 'Speak'})).toBeVisible()
    await expect(c.getByRole('button', {name: 'Good response'})).toBeVisible()
  },
}
