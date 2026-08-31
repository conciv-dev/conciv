import {onMount, type JSX, type ParentProps} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {ChatProvider} from '../../store/chat-context.js'
import {defaultGrouper, type GroupKey} from '../../store/grouping.js'
import {storyConnection} from '../../store/story-connection.js'
import {Thread} from '../thread/thread.js'
import {Attachment} from '../attachment/attachment.js'
import {Message} from './message.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/Message'}
export default meta
type Story = StoryObj

const WITH_ATTACHMENTS: UIMessage = {
  id: 'u-att',
  role: 'user',
  parts: [
    {type: 'text', content: 'Here are the files'},
    {type: 'image', source: {type: 'url', value: 'https://example.com/diagram.png'}},
    {type: 'document', source: {type: 'url', value: 'https://example.com/notes.pdf'}},
  ],
}

function Chip(): JSX.Element {
  return (
    <Attachment.Root class="px-2 py-1 border border-chat-line rounded-chat-surface-sm">
      <Attachment.Name class="text-[0.75rem] text-chat-text-2" />
    </Attachment.Root>
  )
}

function AttachmentsUser(): JSX.Element {
  return (
    <Message.Root class="flex gap-1 self-end">
      <Message.Attachments components={{Image: Chip, Document: Chip}} />
    </Message.Root>
  )
}

function attachmentsApp(component: () => JSX.Element): () => JSX.Element {
  return () => {
    const chat = useChat({connection: storyConnection()})
    onMount(() => chat.setMessages([WITH_ATTACHMENTS]))
    return (
      <ChatProvider chat={chat}>
        <Thread.Root>
          <Thread.Viewport class="flex flex-col gap-2">
            <Thread.Messages components={{UserMessage: component}} />
          </Thread.Viewport>
        </Thread.Root>
      </ChatProvider>
    )
  }
}

export const Attachments: Story = {
  render: attachmentsApp(AttachmentsUser),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('diagram.png')).toBeVisible())
    await expect(c.getByText('notes.pdf')).toBeVisible()
  },
}

function FirstAttachmentUser(): JSX.Element {
  return (
    <Message.Root class="flex gap-1 self-end">
      <Message.AttachmentByIndex index={0} components={{Image: Chip, Document: Chip}} />
    </Message.Root>
  )
}

export const AttachmentByIndexShowsOne: Story = {
  render: attachmentsApp(FirstAttachmentUser),
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByText('diagram.png')).toBeVisible())
    await expect(c.queryByText('notes.pdf')).toBeNull()
  },
}

const CHAIN_THEN_REPLY: UIMessage = {
  id: 'a-grouped',
  role: 'assistant',
  parts: [
    {type: 'thinking', content: 'weighing the options'},
    {type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'complete'},
    {type: 'text', content: 'Here is the fix.'},
  ],
}

function GroupBox(props: ParentProps<{indices: readonly number[]; groupKey: GroupKey}>): JSX.Element {
  return (
    <div data-kind={props.groupKey} class="p-1 border border-chat-line rounded-chat-surface-sm">
      <span class="text-[0.625rem] text-chat-text-3">{props.groupKey}</span>
      {props.children}
    </div>
  )
}

function GroupedAssistant(): JSX.Element {
  return (
    <Message.Root class="text-chat-text flex flex-col gap-1 self-start">
      <Message.Unstable_PartsGrouped components={{Group: GroupBox}} />
    </Message.Root>
  )
}

export const PartsGrouped: Story = {
  render: () => {
    const chat = useChat({connection: storyConnection()})
    onMount(() => chat.setMessages([CHAIN_THEN_REPLY]))
    return (
      <ChatProvider chat={chat}>
        <Thread.Root>
          <Thread.Viewport class="flex flex-col gap-2">
            <Thread.Messages components={{AssistantMessage: GroupedAssistant}} />
          </Thread.Viewport>
        </Thread.Root>
      </ChatProvider>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByText('group-chain')).toBeVisible())
    await expect(c.queryByText('group-page-session')).toBeNull()
    await expect(c.getByText('weighing the options')).toBeVisible()
    await expect(c.getByText('Here is the fix.')).toBeVisible()
  },
}

const CONFIRM_ENTRY: ToolCardEntry = {
  names: ['confirm_ui'],
  render: () => <span>confirm card</span>,
  hasEmbeddedBody: () => true,
  display: 'standalone',
}

const GROUPED_WITH_STANDALONE: UIMessage = {
  id: 'a-grouped-standalone',
  role: 'assistant',
  parts: [
    {type: 'thinking', content: 'weighing the options'},
    {type: 'tool-call', id: 't1', name: 'confirm_ui', arguments: '{}', state: 'complete'},
    {type: 'image', source: {type: 'url', value: 'https://example.com/diagram.png'}},
    {type: 'text', content: 'Here is the fix.'},
  ],
}

function CountingGroupBox(props: ParentProps<{indices: readonly number[]; groupKey: GroupKey}>): JSX.Element {
  return (
    <div class="p-1 border border-chat-line rounded-chat-surface-sm">
      <span class="text-[0.625rem] text-chat-text-3">{`${props.groupKey} holds ${props.indices.length}`}</span>
      {props.children}
    </div>
  )
}

function GroupedWithGrouping(): JSX.Element {
  return (
    <Message.Root class="text-chat-text flex flex-col gap-1 self-start">
      <Message.Unstable_PartsGrouped
        components={{Group: CountingGroupBox, tools: {entries: [CONFIRM_ENTRY]}}}
        grouping={{grouper: defaultGrouper, context: {toolEntries: [CONFIRM_ENTRY]}}}
      />
    </Message.Root>
  )
}

export const PartsGroupedWithGrouping: Story = {
  render: () => {
    const chat = useChat({connection: storyConnection()})
    onMount(() => chat.setMessages([GROUPED_WITH_STANDALONE]))
    return (
      <ChatProvider chat={chat}>
        <Thread.Root>
          <Thread.Viewport class="flex flex-col gap-2">
            <Thread.Messages components={{AssistantMessage: GroupedWithGrouping}} />
          </Thread.Viewport>
        </Thread.Root>
      </ChatProvider>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)

    await waitFor(() => expect(c.getByText('group-chain holds 1')).toBeVisible())
    await expect(c.getByText('confirm card')).toBeVisible()
    await expect(c.getByRole('img')).toBeVisible()
    await expect(c.getByText('Here is the fix.')).toBeVisible()
  },
}
