import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useChat, type UseChatReturn} from '@tanstack/ai-solid'
import {ChatProvider} from '../store/chat-context.js'
import {
  storyConnection,
  createTextChunks,
  createReasoningChunks,
  createToolCallChunks,
} from '../store/story-connection.js'
import {Thread} from './thread.js'
import {Composer} from './composer.js'
import {NowLine} from './now-line.js'

const meta: Meta = {title: 'styled/Thread'}
export default meta
type Story = StoryObj

const WIDE_ARGS = {command: `grep -rn "${'x'.repeat(160)}" packages/`}

function Welcome(): JSX.Element {
  return <div class="text-[color:var(--chat-text-3)] text-[0.8125rem] m-auto">Ask anything to begin.</div>
}

function ThreadApp(props: {theme?: string; expose: (chat: UseChatReturn) => void}): JSX.Element {
  const chat = useChat({
    connection: storyConnection({
      chunks: [
        ...createReasoningChunks('Searching the codebase'),
        ...createToolCallChunks('shell', WIDE_ARGS, {result: 'no matches'}),
        ...createTextChunks('No matches — the symbol is unused and safe to delete.'),
      ],
      chunkDelay: 2,
    }),
  })
  props.expose(chat)
  return (
    <div
      class={`${props.theme ?? ''} rounded-[var(--chat-radius-lg)] h-96 w-96 [background:var(--chat-bg)] overflow-hidden`}
    >
      <ChatProvider chat={chat}>
        <Thread welcome={<Welcome />} composer={<Composer />} />
      </ChatProvider>
    </div>
  )
}

function play(theme?: string): Story {
  return {
    render: () => {
      let chat: UseChatReturn | undefined
      return (
        <div>
          <button type="button" onClick={() => void chat?.sendMessage('search for the symbol')}>
            ask
          </button>
          <ThreadApp
            theme={theme}
            expose={(value) => {
              chat = value
            }}
          />
        </div>
      )
    },
    play: async ({canvasElement}) => {
      const c = within(canvasElement)
      await expect(c.getByText('Ask anything to begin.')).toBeVisible()
      await userEvent.click(c.getByText('ask'))
      await waitFor(() => expect(c.getByText('search for the symbol')).toBeVisible())
      const reply = await waitFor(() => c.getByText(/No matches — the symbol is unused/), {timeout: 5000})

      const before = reply.getBoundingClientRect()

      await userEvent.click(c.getByText('Chain of Thought'))
      await waitFor(() => expect(c.getByText('shell')).toBeVisible())
      await userEvent.click(c.getByText('shell'))

      await waitFor(() => expect(c.getByRole('button', {name: /shell/})).toHaveAttribute('data-state', 'open'))
      const after = reply.getBoundingClientRect()

      expect(after.left).toBeCloseTo(before.left, 0)
      expect(after.right).toBeCloseTo(before.right, 0)
    },
  }
}

export const Neutral: Story = play()
export const Dark: Story = play('chat-theme-dark')
export const Conciv: Story = play('chat-theme-conciv')

function Divider(): JSX.Element {
  return (
    <div class="text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] self-center" role="separator">
      New session
    </div>
  )
}

const renderDivider = (): JSX.Element => <Divider />

function SlotsApp(): JSX.Element {
  const chat = useChat({
    connection: storyConnection({
      chunks: [...createTextChunks('On it.')],
      chunkDelay: 2,
    }),
  })
  return (
    <div class="chat-theme-dark rounded-[var(--chat-radius-lg)] h-96 w-96 [background:var(--chat-bg)] overflow-hidden">
      <ChatProvider chat={chat}>
        <Thread
          turnPrefix={renderDivider}
          viewportFooter={<NowLine title="Running pnpm test" onStop={() => chat.stop()} />}
          composer={
            <Composer
              busy={<span class="text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)]">Compacting…</span>}
            />
          }
        />
      </ChatProvider>
    </div>
  )
}

export const Slots: Story = {
  render: () => <SlotsApp />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await waitFor(() => expect(c.getByText('Running pnpm test')).toBeVisible())
    await waitFor(() => expect(c.getByText('Compacting…')).toBeVisible())
  },
}
