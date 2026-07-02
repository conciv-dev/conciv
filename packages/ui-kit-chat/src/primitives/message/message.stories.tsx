import {onMount, type JSX, type ParentProps} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../../store/chat-context.js'
import {storyConnection} from '../../store/story-connection.js'
import {Thread} from '../thread/thread.js'
import {Attachment} from '../attachment/attachment.js'
import {Message} from './message.js'

const meta: Meta = {title: 'primitives/Message'}
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
    <Attachment.Root class="px-2 py-1 border border-pw-line rounded-pw-sm">
      <Attachment.Name class="text-[0.75rem] text-pw-text-2" />
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

function GroupBox(props: ParentProps<{indices: number[]; kind: 'chain' | 'reply'}>): JSX.Element {
  return (
    <div data-kind={props.kind} class="p-1 border border-pw-line rounded-pw-sm">
      <span class="text-[0.625rem] text-pw-text-3">group:{props.kind}</span>
      {props.children}
    </div>
  )
}

function GroupedAssistant(): JSX.Element {
  return (
    <Message.Root class="text-pw-text flex flex-col gap-1 self-start">
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

    await waitFor(() => expect(c.getByText('group:chain')).toBeVisible())
    await expect(c.getByText('group:reply')).toBeVisible()
    await expect(c.getByText('weighing the options')).toBeVisible()
    await expect(c.getByText('Here is the fix.')).toBeVisible()
  },
}
