import {For, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useChat} from '@tanstack/ai-solid'
import {ChatProvider, useThread, useComposer} from './chat-context.js'
import {storyConnection, createTextChunks, createReasoningChunks, createToolCallChunks} from './story-connection.js'
import type {MessagePart} from '@tanstack/ai-client'

const meta: Meta = {title: 'ui-kit-chat/store/ChatProvider'}
export default meta
type Story = StoryObj

function partLabel(part: MessagePart): string {
  if (part.type === 'text') return part.content
  if (part.type === 'thinking') return `thinking:${part.content}`
  if (part.type === 'tool-call') return `tool:${part.name}`
  if (part.type === 'tool-result') return `result:${part.toolCallId}`
  return `(${part.type})`
}

function ThreadDump(): JSX.Element {
  const thread = useThread()
  const composer = useComposer()
  return (
    <div class="text-[0.8125rem] text-pw-text flex flex-col gap-2">
      <div>Turns: {thread.turns.length}</div>
      <div>Running: {String(thread.isRunning)}</div>
      <For each={thread.turns}>
        {(turn) => (
          <div data-turn={turn.role}>
            [{turn.role}] {turn.parts.map(partLabel).join(' · ')}
          </div>
        )}
      </For>
      <button
        type="button"
        class="text-pw-on-accent px-3 py-1.5 rounded-pw-md bg-pw-accent w-fit"
        onClick={() => {
          composer.setText('Explain the bug')
          composer.send()
        }}
      >
        Send
      </button>
    </div>
  )
}

export const StreamsTextThroughRealUseChat: Story = {
  render: () => {
    const chat = useChat({
      connection: storyConnection({
        chunks: [
          ...createReasoningChunks('Looking at the stack trace'),
          ...createToolCallChunks('read', {path: 'index.ts'}, {result: 'export const x = 1'}),
          ...createTextChunks('The bug is a missing await.'),
        ],
        chunkDelay: 3,
      }),
    })
    return (
      <ChatProvider chat={chat}>
        <ThreadDump />
      </ChatProvider>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', {name: 'Send'}))
    await waitFor(() => expect(c.getByText(/The bug is a missing await\./)).toBeVisible(), {timeout: 4000})
    await waitFor(() => expect(c.getByText('Running: false')).toBeVisible())
  },
}
