import {onMount, Show, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../../store/chat-context.js'
import {storyConnection} from '../../store/story-connection.js'
import {Thread} from '../thread/thread.js'
import {Message} from '../message/message.js'
import {SAMPLE_IMAGE_BASE64, SAMPLE_IMAGE_MIME} from '../../store/sample-image.fixtures.js'
import {MessagePart, useMessagePartData, useMessagePartFile, useMessagePartSource} from './message-part.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/MessagePart'}
export default meta
type Story = StoryObj

function ImageView(): JSX.Element {
  return <MessagePart.Image alt="attached" class="rounded-pw-sm size-12" />
}

function UserMessage(): JSX.Element {
  return (
    <Message.Root class="flex flex-col gap-1 self-end">
      <Message.Parts components={{Image: ImageView}} />
    </Message.Root>
  )
}

export const ImagePart: Story = {
  render: () => {
    const chat = useChat({connection: storyConnection()})
    const message: UIMessage = {
      id: 'u-img',
      role: 'user',
      parts: [
        {type: 'text', content: 'Here is the screenshot'},
        {type: 'image', source: {type: 'data', value: SAMPLE_IMAGE_BASE64, mimeType: SAMPLE_IMAGE_MIME}},
      ],
    }
    onMount(() => chat.setMessages([message]))
    return (
      <ChatProvider chat={chat}>
        <Thread.Root class="flex flex-col gap-2">
          <Thread.Viewport class="flex flex-col gap-2">
            <Thread.Messages components={{UserMessage}} />
          </Thread.Viewport>
        </Thread.Root>
      </ChatProvider>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('Here is the screenshot')).toBeVisible())
    await waitFor(() => expect(c.getByAltText('attached')).toBeInTheDocument())
  },
}

function RunningTool(): JSX.Element {
  return (
    <MessagePart.InProgress>
      <span>running…</span>
    </MessagePart.InProgress>
  )
}

function InProgressUser(): JSX.Element {
  return (
    <Message.Root class="flex flex-col gap-1 self-start">
      <Message.Parts components={{tools: {Fallback: RunningTool}}} />
    </Message.Root>
  )
}

export const InProgressWhileToolRuns: Story = {
  render: () => {
    const chat = useChat({connection: storyConnection()})
    const message: UIMessage = {
      id: 'a-run',
      role: 'assistant',
      parts: [{type: 'tool-call', id: 't1', name: 'read', arguments: '{}', state: 'input-streaming'}],
    }
    onMount(() => chat.setMessages([message]))
    return (
      <ChatProvider chat={chat}>
        <Thread.Root>
          <Thread.Viewport>
            <Thread.Messages components={{AssistantMessage: InProgressUser}} />
          </Thread.Viewport>
        </Thread.Root>
      </ChatProvider>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('running…')).toBeVisible())
  },
}

function AccessorProbes(): JSX.Element {
  const file = useMessagePartFile()
  const data = useMessagePartData()
  const source = useMessagePartSource()
  return (
    <>
      <Show when={file()}>
        <span>file:present</span>
      </Show>
      <Show when={data()} keyed>
        {(part) => <span>data:{part.status}</span>}
      </Show>
      <Show when={source()}>
        <span>source:present</span>
      </Show>
    </>
  )
}

function ProbeAssistant(): JSX.Element {
  return (
    <Message.Root class="text-pw-text flex flex-col gap-1 self-start">
      <Message.Parts>{() => <AccessorProbes />}</Message.Parts>
    </Message.Root>
  )
}

export const PartAccessors: Story = {
  render: () => {
    const chat = useChat({connection: storyConnection()})
    const message: UIMessage = {
      id: 'a-parts',
      role: 'assistant',
      parts: [
        {type: 'document', source: {type: 'data', value: '', mimeType: 'application/pdf'}},
        {type: 'structured-output', status: 'complete', raw: '{"ok":true}'},
        {type: 'text', content: 'done'},
      ],
    }
    onMount(() => chat.setMessages([message]))
    return (
      <ChatProvider chat={chat}>
        <Thread.Root>
          <Thread.Viewport>
            <Thread.Messages components={{AssistantMessage: ProbeAssistant}} />
          </Thread.Viewport>
        </Thread.Root>
      </ChatProvider>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('file:present')).toBeVisible())
    await expect(c.getByText('data:complete')).toBeVisible()

    await expect(c.queryByText('source:present')).toBeNull()
  },
}
