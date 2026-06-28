import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useChat, type UseChatReturn} from '@tanstack/ai-solid'
import {ChatProvider, useChatContext} from '../store/chat-context.js'
import {storyConnection, createTextChunks} from '../store/story-connection.js'
import {Thread} from '../primitives/thread/thread.js'
import {Message} from '../primitives/message/message.js'

const meta: Meta = {title: 'behaviors/Scroll'}
export default meta
type Story = StoryObj

function AtBottomEcho(): JSX.Element {
  const chat = useChatContext()
  return <div>atBottom: {String(chat.view.viewport.isAtBottom)}</div>
}

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

// A long reply that wraps to far more than the viewport height, so following it requires autoscroll.
const LONG_REPLY = `${'The bug is a missing await. '.repeat(40)}END_OF_ANSWER`

function StreamingThread(props: {expose: (chat: UseChatReturn) => void}): JSX.Element {
  const chat = useChat({connection: storyConnection({chunks: createTextChunks(LONG_REPLY), chunkDelay: 3})})
  props.expose(chat)
  return (
    <ChatProvider chat={chat}>
      <Thread.Root class="flex flex-col">
        <Thread.Viewport class="p-2 border border-pw-line rounded-pw-sm flex flex-col gap-1 h-32 overflow-y-auto">
          <Thread.Empty>
            <div class="text-[0.75rem] text-pw-text-3">Ask to begin.</div>
          </Thread.Empty>
          <Thread.Messages components={{UserMessage, AssistantMessage}} />
        </Thread.Viewport>
        <AtBottomEcho />
      </Thread.Root>
    </ChatProvider>
  )
}

// D10: a short thread starts at the bottom; the streamed answer overflows the viewport and the
// thread sticks to the bottom (autoscroll follows), so the answer's tail stays in view and the
// at-bottom flag never flips to false.
export const SticksToBottomWhileStreaming: Story = {
  render: () => {
    let chat: UseChatReturn | undefined
    return (
      <div>
        <button type="button" onClick={() => void chat?.sendMessage('why is it broken?')}>
          ask
        </button>
        <StreamingThread
          expose={(value) => {
            chat = value
          }}
        />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    // Empty + fits the viewport → at the bottom.
    await waitFor(() => expect(c.getByText('atBottom: true')).toBeVisible())
    await userEvent.click(c.getByText('ask'))
    // The overflowing answer streams in; sticking to the bottom keeps the at-bottom flag true and the
    // answer's tail in view. If autoscroll had not followed, the flag would flip to false.
    await waitFor(() => expect(c.getByText(/END_OF_ANSWER/)).toBeVisible(), {timeout: 6000})
    await waitFor(() => expect(c.getByText('atBottom: true')).toBeVisible())
  },
}
