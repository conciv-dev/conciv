import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {onMount, type JSX} from 'solid-js'
import {page, userEvent} from 'vitest/browser'
import {expect, it} from 'vitest'
import {createChat} from '@conciv/ai/client'
import type {ChatPart, ChatMessage} from '@conciv/protocol/chat-message-types'
import {ChatProvider} from '../src/store/chat-context.js'
import {createReasoningChunks, createToolCallChunks, storyConnection} from '@conciv/ai/testkit'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'
import {haltRun, startRun, streamingThread} from './run-harness.js'

const TIMEOUT_MS = 3000

function staticThread(parts: ChatPart[]): () => JSX.Element {
  const messages: ChatMessage[] = [
    {id: 'u1', role: 'user', parts: [{type: 'text', content: 'go'}]},
    {id: 'a1', role: 'assistant', parts},
  ]
  return function StaticThread(): JSX.Element {
    const chat = createChat({threadId: 'thinking-narration', connection: storyConnection()})
    onMount(() => chat.setMessages(messages))
    return (
      <ChatProvider chat={chat}>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </ChatProvider>
    )
  }
}

const traceTrigger = () => page.getByRole('button', {name: /trace/i})

it('keeps a readable trace for a segment that only reasoned and ran no tool', async () => {
  mountView(
    staticThread([
      {type: 'thinking', content: 'weighing the rename against the call sites'},
      {type: 'text', content: 'All set.'},
    ]),
  )

  await expect.element(traceTrigger(), {timeout: TIMEOUT_MS}).toHaveAttribute('data-state', 'open')
  await expect
    .element(page.getByText('weighing the rename against the call sites'), {timeout: TIMEOUT_MS})
    .toBeVisible()
  await userEvent.click(traceTrigger())
  await expect.element(page.getByText('reasoning', {exact: true})).toBeVisible()
  await page.screenshot({path: '__screenshots__/thinking-narration/reasoning-only-trace.png'})
})

const RUNNING_TOOL_CHUNKS = [
  ...createReasoningChunks('mapping the repo'),
  ...createToolCallChunks('Bash', {command: 'ls'}),
]

it('narrates the running tool on the collapsed trace line instead of a tally', async () => {
  mountView(streamingThread(RUNNING_TOOL_CHUNKS, 10))

  await startRun()
  await expect.element(traceTrigger(), {timeout: TIMEOUT_MS}).toHaveAttribute('data-state', 'open')
  await userEvent.click(traceTrigger())
  await expect.element(traceTrigger()).toHaveAttribute('data-state', 'closed')
  await expect.element(page.getByText('Running ls', {exact: true}), {timeout: TIMEOUT_MS}).toBeVisible()
  await page.screenshot({path: '__screenshots__/thinking-narration/collapsed-activity-line.png'})

  await haltRun()
})
