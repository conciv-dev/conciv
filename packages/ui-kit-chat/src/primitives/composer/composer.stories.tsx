import {createSignal, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, fn, within, userEvent, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider} from '../../store/chat-context.js'
import {storyConnection, createTextChunks} from '../../store/story-connection.js'
import {Thread} from '../thread/thread.js'
import {Message} from '../message/message.js'
import {QueueItem, type QueuedMessage} from '../queue-item/queue-item.js'
import {ComposerHandlersProvider} from './composer-handlers.js'
import {Composer} from './composer.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/Composer'}
export default meta
type Story = StoryObj

function UserMessage(): JSX.Element {
  return (
    <Message.Root class="text-pw-on-accent px-3 py-1.5 rounded-pw-md bg-pw-accent self-end">
      <Message.Parts />
    </Message.Root>
  )
}

function AssistantMessage(): JSX.Element {
  return (
    <Message.Root class="text-pw-text self-start">
      <Message.Parts />
    </Message.Root>
  )
}

function ComposerApp(): JSX.Element {
  const chat = useChat({connection: storyConnection({chunks: createTextChunks('Got it.'), chunkDelay: 2})})
  return (
    <ChatProvider chat={chat}>
      <Thread.Root class="flex flex-col gap-2">
        <Thread.Viewport class="flex flex-col gap-2 min-h-20">
          <Thread.Messages components={{UserMessage, AssistantMessage}} />
        </Thread.Viewport>
        <Composer.Root class="flex gap-2 items-end">
          <Composer.Input placeholder="Message…" class="flex-1" aria-label="Message" />
          <Composer.Send class="text-pw-on-accent px-3 py-1.5 rounded-pw-md bg-pw-accent disabled:opacity-40">
            Send
          </Composer.Send>
          <Composer.Cancel class="text-pw-text px-3 py-1.5 rounded-pw-md bg-pw-fill-strong">Stop</Composer.Cancel>
        </Composer.Root>
      </Thread.Root>
    </ChatProvider>
  )
}

export const TypeAndSend: Story = {
  render: () => <ComposerApp />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const input = c.getByLabelText('Message')
    await userEvent.type(input, 'fix the bug')
    await userEvent.click(c.getByRole('button', {name: 'Send'}))
    await waitFor(() => expect(c.getByText('fix the bug')).toBeVisible())
    await waitFor(() => expect(c.getByText('Got it.')).toBeVisible(), {timeout: 4000})
  },
}

export const EnterSubmits: Story = {
  render: () => <ComposerApp />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    const input = c.getByLabelText('Message')
    await userEvent.type(input, 'ship it{Enter}')
    await waitFor(() => expect(c.getByText('ship it')).toBeVisible())
  },
}

function CancelApp(props: {onCancel: () => void}): JSX.Element {
  const chat = useChat({connection: storyConnection({chunks: createTextChunks('Got it.'), chunkDelay: 2000})})
  return (
    <ChatProvider chat={chat}>
      <ComposerHandlersProvider value={{onCancel: props.onCancel}}>
        <Composer.Root class="flex gap-2 items-end">
          <Composer.Input placeholder="Message…" class="flex-1" aria-label="Message" />
          <Composer.Send class="text-pw-on-accent px-3 py-1.5 rounded-pw-md bg-pw-accent disabled:opacity-40">
            Send
          </Composer.Send>
          <Composer.Cancel class="text-pw-text px-3 py-1.5 rounded-pw-md bg-pw-fill-strong">Stop</Composer.Cancel>
        </Composer.Root>
      </ComposerHandlersProvider>
    </ChatProvider>
  )
}

const buttonCancelSpy = fn()

export const CancelButtonRoutesThroughHandler: Story = {
  render: () => <CancelApp onCancel={buttonCancelSpy} />,
  play: async ({canvasElement}) => {
    buttonCancelSpy.mockClear()
    const c = within(canvasElement)
    await userEvent.type(c.getByLabelText('Message'), 'run it{Enter}')
    const stop = await waitFor(() => c.getByRole('button', {name: 'Stop'}))
    await userEvent.click(stop)
    await waitFor(() => expect(buttonCancelSpy).toHaveBeenCalledTimes(1))
  },
}

const escapeCancelSpy = fn()

export const EscapeRoutesThroughHandler: Story = {
  render: () => <CancelApp onCancel={escapeCancelSpy} />,
  play: async ({canvasElement}) => {
    escapeCancelSpy.mockClear()
    const c = within(canvasElement)
    const input = c.getByLabelText('Message')
    await userEvent.type(input, 'run it{Enter}')
    await waitFor(() => c.getByRole('button', {name: 'Stop'}))
    await userEvent.click(input)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(escapeCancelSpy).toHaveBeenCalledTimes(1))
  },
}

function QueueApp(): JSX.Element {
  const [queue, setQueue] = createSignal<QueuedMessage[]>([
    {id: 'q1', text: 'also add a test'},
    {id: 'q2', text: 'and update the docs'},
  ])
  return (
    <ComposerHandlersProvider
      value={{
        queue,
        removeQueued: (id) => setQueue((prev) => prev.filter((item) => item.id !== id)),
        steerQueued: () => {},
      }}
    >
      <div class="flex flex-col gap-1">
        <Composer.Queue>
          {() => (
            <div class="text-[0.75rem] text-pw-text-2 flex gap-2 items-center">
              <QueueItem.Text class="flex-1" />
              <QueueItem.Remove class="text-pw-text-3">×</QueueItem.Remove>
            </div>
          )}
        </Composer.Queue>
      </div>
    </ComposerHandlersProvider>
  )
}

export const QueueMapsPendingMessages: Story = {
  render: () => <QueueApp />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('also add a test')).toBeVisible())
    await expect(c.getByText('and update the docs')).toBeVisible()
    const [firstRemove] = c.getAllByRole('button', {name: 'Remove from queue'})
    if (firstRemove) await userEvent.click(firstRemove)
    await waitFor(() => expect(c.queryByText('also add a test')).toBeNull())
    await expect(c.getByText('and update the docs')).toBeVisible()
  },
}
