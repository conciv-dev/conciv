import {onMount, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor, userEvent} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../../store/chat-context.js'
import {storyConnection} from '../../store/story-connection.js'
import {Thread} from '../thread/thread.js'
import {Message} from '../message/message.js'
import {ActionBar} from './action-bar.js'
import {ActionHandlersProvider} from './action-handlers.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/ActionBar'}
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

function FloatBar(): JSX.Element {
  return (
    <ActionBar.Root role="toolbar" autohide="not-last" autohideFloat="single-branch" class="flex gap-1">
      <ActionBar.Copy class="text-[0.6875rem] text-pw-text-2 px-1.5 py-0.5 border border-pw-line rounded-pw-sm">
        Copy
      </ActionBar.Copy>
    </ActionBar.Root>
  )
}

function FloatAssistant(): JSX.Element {
  return (
    <Message.Root class="text-pw-text flex flex-col gap-1 self-start">
      <Message.Parts />
      <FloatBar />
    </Message.Root>
  )
}

function FloatUser(): JSX.Element {
  return (
    <Message.Root class="text-pw-on-accent px-2 py-1 self-end">
      <Message.Parts />
    </Message.Root>
  )
}

function FloatFrame(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  onMount(() => chat.setMessages([REPLY, {id: 'u1', role: 'user', parts: [{type: 'text', content: 'thanks'}]}]))
  return (
    <ChatProvider chat={chat}>
      <Thread.Root>
        <Thread.Viewport>
          <Thread.Messages components={{AssistantMessage: FloatAssistant, UserMessage: FloatUser}} />
        </Thread.Viewport>
      </Thread.Root>
    </ChatProvider>
  )
}

export const AutohideFloatOnHover: Story = {
  render: () => <FloatFrame />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByText('Add the missing await on line 12.')).toBeVisible())
    await expect(c.queryByRole('toolbar')).toBeNull()
    await userEvent.hover(c.getByText('Add the missing await on line 12.'))
    const bar = await waitFor(() => c.getByRole('toolbar'))
    await expect(bar).toBeVisible()
    await expect(bar).toHaveAttribute('data-floating', 'true')
    await userEvent.unhover(c.getByText('Add the missing await on line 12.'))
    await waitFor(() => expect(c.queryByRole('toolbar')).toBeNull())
  },
}
