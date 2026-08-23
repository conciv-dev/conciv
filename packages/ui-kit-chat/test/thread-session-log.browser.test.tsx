import 'virtual:uno.css'
import {onMount, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ChatProvider} from '../src/store/chat-context.js'
import {ToolProvider} from '../src/store/tool-context.js'
import {createTextChunks, storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'
import {RunSettledIndicator, startRun, waitForRunSettled} from './run-harness.js'

function baseToolCtx(): ToolViewCtx {
  return {
    apiBase: '',
    harnessId: 'test',
    sendMessage: () => {},
    catalog: {loaded: () => true, meta: () => undefined},
    addResult: () => {},
  }
}

function StreamingThread(): JSX.Element {
  const chat = useChat({
    connection: storyConnection({chunks: createTextChunks('The fix is a missing await.'), chunkDelay: 400}),
  })
  return (
    <ChatProvider chat={chat}>
      <ToolProvider value={baseToolCtx()}>
        <button type="button" onClick={() => void chat.sendMessage('what is the bug?')}>
          ask
        </button>
        <RunSettledIndicator />
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </ToolProvider>
    </ChatProvider>
  )
}

it('shows a blinking caret on the streaming answer and removes it once the run settles', async () => {
  const container = mountView(() => <StreamingThread />)

  await startRun()
  await expect.element(page.getByText(/The fix/), {timeout: 3000}).toBeVisible()

  const proseRoot = container.querySelector('.sd-root')
  if (!proseRoot) throw new Error('expected the streamed markdown root to be mounted')
  await expect.element(page.elementLocator(proseRoot)).toHaveClass(/chat-caret-live/)
  await page.screenshot({path: '__screenshots__/thread-session-log/streaming-caret.png'})

  await waitForRunSettled()
  await expect.element(page.elementLocator(proseRoot)).not.toHaveClass(/chat-caret-live/)
})

const LONG_PROMPT = `${'the stack trace points at the wrong file, '.repeat(6)}can you check the retry path too?`

function messagesWithPrompts(): UIMessage[] {
  return [
    {id: 'u1', role: 'user', parts: [{type: 'text', content: 'quick question'}]},
    {id: 'u2', role: 'user', parts: [{type: 'text', content: LONG_PROMPT}]},
  ]
}

function StaticPromptsThread(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  onMount(() => chat.setMessages(messagesWithPrompts()))
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

function promptSpanOf(container: HTMLElement, text: string): HTMLElement {
  const match = [...container.querySelectorAll('span')].find((span) => span.textContent === text)
  if (!match) throw new Error(`missing prompt span for: ${text}`)
  return match
}

it('keeps every prompt in the one mono terminal face however long it runs', async () => {
  const container = mountView(() => <StaticPromptsThread />)

  await expect.element(page.getByText('quick question'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText(LONG_PROMPT), {timeout: 3000}).toBeVisible()

  await expect
    .element(page.elementLocator(promptSpanOf(container, 'quick question')))
    .toHaveClass('[font-family:var(--chat-mono)]')
  await expect
    .element(page.elementLocator(promptSpanOf(container, LONG_PROMPT)))
    .toHaveClass('[font-family:var(--chat-mono)]')
  await page.screenshot({path: '__screenshots__/thread-session-log/prompt-line-faces.png'})
})

function messagesWithSettledTrace(): UIMessage[] {
  return [
    {id: 'u1', role: 'user', parts: [{type: 'text', content: 'find the leak'}]},
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {type: 'thinking', content: 'checking the event listeners first'},
        {
          type: 'tool-call',
          id: 'call1',
          name: 'bash',
          arguments: '{"command":"grep -rn addEventListener src"}',
          input: {command: 'grep -rn addEventListener src'},
          state: 'complete',
          output: 'src/watcher.ts:12',
        },
        {type: 'text', content: 'Found it in watcher.ts.'},
      ],
    },
    {id: 'u2', role: 'user', parts: [{type: 'text', content: 'thanks, fix it'}]},
    {id: 'a2', role: 'assistant', parts: [{type: 'text', content: 'Fixed and verified.'}]},
  ]
}

function SettledTraceThread(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  onMount(() => chat.setMessages(messagesWithSettledTrace()))
  return (
    <ChatProvider chat={chat}>
      <ToolProvider value={baseToolCtx()}>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </ToolProvider>
    </ChatProvider>
  )
}

it('collapses a settled, non-active turn to its record line and expands it again on toggle', async () => {
  mountView(() => <SettledTraceThread />)

  await expect.element(page.getByText('Found it in watcher.ts.'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('Fixed and verified.'), {timeout: 3000}).toBeVisible()

  const trigger = page.getByRole('button', {name: /trace/i})
  await expect.element(trigger, {timeout: 3000}).toHaveAttribute('data-state', 'closed')
  await expect.element(page.getByText('checking the event listeners first'), {timeout: 3000}).not.toBeInTheDocument()
  await page.screenshot({path: '__screenshots__/thread-session-log/collapsed-record.png'})

  await trigger.click()

  await expect.element(trigger, {timeout: 3000}).toHaveAttribute('data-state', 'open')
  await expect.element(page.getByText('checking the event listeners first'), {timeout: 3000}).toBeVisible()
  await new Promise((resolve) => setTimeout(resolve, 900))
  await page.screenshot({path: '__screenshots__/thread-session-log/expanded-record.png'})
})

it('renders the answer prose after the trace/record row when the trace precedes it in the stream', async () => {
  mountView(() => <SettledTraceThread />)

  const answerLocator = page.getByText('Found it in watcher.ts.')
  const triggerLocator = page.getByRole('button', {name: /trace/i})
  await expect.element(answerLocator, {timeout: 3000}).toBeVisible()
  await expect.element(triggerLocator, {timeout: 3000}).toBeVisible()

  const answer = answerLocator.element()
  const trigger = triggerLocator.element()
  const order = trigger.compareDocumentPosition(answer)
  expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
})

it('leaves every settled trace row free of the running ring once the run is over', async () => {
  mountView(() => <SettledTraceThread />)

  await expect.element(page.getByText('Found it in watcher.ts.'), {timeout: 3000}).toBeVisible()
  await page.getByRole('button', {name: /trace/i}).click()
  await expect.element(page.getByText('checking the event listeners first'), {timeout: 3000}).toBeVisible()

  expect(document.querySelectorAll('[role="img"][aria-label="running"]')).toHaveLength(0)
})

function messagesWithoutTools(): UIMessage[] {
  return [
    {id: 'u1', role: 'user', parts: [{type: 'text', content: 'what does this module do'}]},
    {
      id: 'a1',
      role: 'assistant',
      parts: [{type: 'text', content: 'It coalesces messages into turns.'}],
    },
  ]
}

function ToollessThread(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  onMount(() => chat.setMessages(messagesWithoutTools()))
  return (
    <ChatProvider chat={chat}>
      <ToolProvider value={baseToolCtx()}>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </ToolProvider>
    </ChatProvider>
  )
}

it('renders no trace at all for a turn segment that neither reasoned nor ran tools', async () => {
  mountView(() => <ToollessThread />)

  await expect.element(page.getByText('It coalesces messages into turns.'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: /trace/i})).not.toBeInTheDocument()
})

function messagesWithTwoSegments(): UIMessage[] {
  return [
    {id: 'u1', role: 'user', parts: [{type: 'text', content: 'ship the fix'}]},
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          id: 'call1',
          name: 'Read',
          arguments: '{"file_path":"src/watcher.ts"}',
          input: {file_path: 'src/watcher.ts'},
          state: 'complete',
          output: 'one\ntwo',
        },
        {type: 'text', content: 'The listener is never removed.'},
        {
          type: 'tool-call',
          id: 'call2',
          name: 'Bash',
          arguments: '{"command":"pnpm test"}',
          input: {command: 'pnpm test'},
          state: 'complete',
          output: '{"stdout":"ok","exitCode":0}',
        },
        {type: 'text', content: 'Tests are green.'},
      ],
    },
  ]
}

function TwoSegmentThread(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  onMount(() => chat.setMessages(messagesWithTwoSegments()))
  return (
    <ChatProvider chat={chat}>
      <ToolProvider value={baseToolCtx()}>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </ToolProvider>
    </ChatProvider>
  )
}

it('gives each trace segment of one turn its own summary line', async () => {
  mountView(() => <TwoSegmentThread />)

  await expect.element(page.getByText('Tests are green.'), {timeout: 3000}).toBeVisible()

  const triggers = page.getByRole('button', {name: /trace/i})
  await expect.element(triggers.nth(0), {timeout: 3000}).toHaveTextContent('1 read')
  await expect.element(triggers.nth(1), {timeout: 3000}).toHaveTextContent('1 bash')
})

function messagesWithInterleavedTurn(): UIMessage[] {
  return [
    {id: 'u1', role: 'user', parts: [{type: 'text', content: 'why is the build red'}]},
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        {type: 'text', content: 'Let me check the CI logs.'},
        {
          type: 'tool-call',
          id: 'call1',
          name: 'bash',
          arguments: '{"command":"grep -rn ERROR ci.log"}',
          input: {command: 'grep -rn ERROR ci.log'},
          state: 'complete',
          output: 'ci.log:9: ERROR type mismatch',
        },
        {type: 'text', content: 'The build fails from a type mismatch on line 9.'},
      ],
    },
  ]
}

function InterleavedTurnThread(): JSX.Element {
  const chat = useChat({connection: storyConnection()})
  onMount(() => chat.setMessages(messagesWithInterleavedTurn()))
  return (
    <ChatProvider chat={chat}>
      <ToolProvider value={baseToolCtx()}>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages />
          </Thread.Viewport>
        </Thread>
      </ToolProvider>
    </ChatProvider>
  )
}

it('renders text, trace, then text in stream order for a turn with parts interleaved around a tool call', async () => {
  const container = mountView(() => <InterleavedTurnThread />)

  const firstTextLocator = page.getByText('Let me check the CI logs.')
  const triggerLocator = page.getByRole('button', {name: /trace/i})
  const answerLocator = page.getByText('The build fails from a type mismatch on line 9.')
  await expect.element(firstTextLocator, {timeout: 3000}).toBeVisible()
  await expect.element(triggerLocator, {timeout: 3000}).toBeVisible()
  await expect.element(answerLocator, {timeout: 3000}).toBeVisible()

  const contentRows = [...container.querySelectorAll('[data-pw-msg] > *:not(.absolute)')]
  const firstTextRow = firstTextLocator.element()
  const triggerRow = triggerLocator.element()
  const answerRow = answerLocator.element()
  const indexOf = (descendant: Element): number =>
    contentRows.findIndex((row) => row === descendant || row.contains(descendant))
  const firstTextIndex = indexOf(firstTextRow)
  const triggerIndex = indexOf(triggerRow)
  const answerIndex = indexOf(answerRow)

  expect(firstTextIndex).toBeGreaterThanOrEqual(0)
  expect(triggerIndex).toBeGreaterThan(firstTextIndex)
  expect(answerIndex).toBeGreaterThan(triggerIndex)
  expect(answerIndex).toBe(contentRows.length - 1)
  await page.screenshot({path: '__screenshots__/thread-session-log/interleaved-turn-order.png'})
})
