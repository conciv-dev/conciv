import 'virtual:uno.css'
import {onMount, type JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {MessagePart, ToolCallPart, UIMessage} from '@tanstack/ai-client'
import {ChatProvider} from '../src/store/chat-context.js'
import {EventType} from '@tanstack/ai'
import {
  createReasoningChunks,
  createTextChunks,
  createToolCallChunks,
  storyConnection,
} from '../src/store/story-connection.js'
import type {PageSessionConfig, PageSessionRenderProps} from '../src/store/page-session.js'
import {Thread} from '../src/styled/thread.js'
import {Activity} from '../src/styled/activity.js'
import {mountView} from './mount-view.js'

const cardMounts: string[] = []

function StubSessionCard(props: PageSessionRenderProps): JSX.Element {
  onMount(() => cardMounts.push('card'))
  return (
    <div>
      <span>{props.streaming ? 'session live' : 'session settled'}</span>
      <span>{`session acts ${props.parts.length}`}</span>
      <span>{`first result ${props.resultFor(props.parts[0]?.id ?? '') === undefined ? 'missing' : 'paired'}`}</span>
      <span>{`session thinking ${props.thinking.length}`}</span>
    </div>
  )
}

const PAGE_SESSION: PageSessionConfig = {
  render: StubSessionCard,
  actNames: new Set(['page.fill', 'page.check']),
  toolPrefix: 'page.',
}

function fillChunks(toolCallId: string, withResult: boolean) {
  return createToolCallChunks(
    'page.fill',
    {selector: '#field', value: 'hello'},
    {toolCallId, ...(withResult ? {result: '{"ok":true,"value":"hello"}'} : {})},
  )
}

function threadHarness(
  options: Parameters<typeof storyConnection>[0],
  pageSession?: PageSessionConfig,
): () => JSX.Element {
  return function ThreadHarness(): JSX.Element {
    const chat = useChat({connection: storyConnection(options)})
    return (
      <ChatProvider chat={chat}>
        <button type="button" onClick={() => void chat.sendMessage('drive the page')}>
          ask
        </button>
        <button type="button" onClick={() => void chat.stop()}>
          halt
        </button>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages pageSession={pageSession} />
          </Thread.Viewport>
        </Thread>
      </ChatProvider>
    )
  }
}

it('renders one injected page-session card with the reply and no chain for a settled act run', async () => {
  mountView(
    threadHarness(
      {
        chunks: [...fillChunks('f1', true), ...fillChunks('f2', true), ...createTextChunks('Filled the form.')],
        chunkDelay: 1,
      },
      PAGE_SESSION,
    ),
  )

  await page.getByRole('button', {name: 'ask'}).click()

  await expect.element(page.getByText('Filled the form.'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('session settled')).toBeVisible()
  await expect.element(page.getByText('session acts 2')).toBeVisible()
  await expect.element(page.getByText('first result paired')).toBeVisible()
  expect(page.getByText('session settled').elements()).toHaveLength(1)
  await expect.element(page.getByText('Chain of Thought')).not.toBeInTheDocument()
})

it('marks the trailing page-session streaming while the run is live and settles it on stop', async () => {
  mountView(
    threadHarness(
      {chunks: [...fillChunks('f1', true), ...fillChunks('f2', false)], runsUntilStopped: true},
      PAGE_SESSION,
    ),
  )

  await page.getByRole('button', {name: 'ask'}).click()
  await expect.element(page.getByText('session live'), {timeout: 3000}).toBeVisible()

  await page.getByRole('button', {name: 'halt'}).click()
  await expect.element(page.getByText('session settled'), {timeout: 3000}).toBeVisible()
})

it('keeps the flat chain rendering when no page-session config is passed', async () => {
  mountView(
    threadHarness({chunks: [...fillChunks('f1', true), ...createTextChunks('Filled the form.')], chunkDelay: 1}),
  )

  await page.getByRole('button', {name: 'ask'}).click()

  await expect.element(page.getByText('Filled the form.'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('Chain of Thought')).toBeVisible()
  await expect.element(page.getByText('session settled')).not.toBeInTheDocument()
})

function user(id: string, text: string): UIMessage {
  return {id, role: 'user', parts: [{type: 'text', content: text}]}
}

function assistant(id: string, parts: MessagePart[]): UIMessage {
  return {id, role: 'assistant', parts}
}

function call(id: string, name: string, state: ToolCallPart['state']): MessagePart {
  return {type: 'tool-call', id, name, arguments: '{}', state}
}

function subCall(id: string, name: string, parent: string, state: ToolCallPart['state']): MessagePart {
  const part: ToolCallPart & {metadata?: {parentToolCallId?: string}} = {
    type: 'tool-call',
    id,
    name,
    arguments: '{}',
    state,
    metadata: {parentToolCallId: parent},
  }
  return part
}

function result(toolCallId: string, state: 'complete' | 'error'): MessagePart {
  return {type: 'tool-result', toolCallId, content: '{"ok":true}', state}
}

const label = (part: ToolCallPart): string => part.name

function ActivityHarness(props: {messages: UIMessage[]; live?: boolean}): JSX.Element {
  return (
    <div class="flex flex-col h-96 w-96">
      <Activity.Root messages={props.messages} live={props.live} label={label} pageSession={PAGE_SESSION}>
        <Activity.Timeline />
      </Activity.Root>
    </div>
  )
}

it('selects a trailing page-session as the live segment instead of the last chain', async () => {
  mountView(() => (
    <ActivityHarness
      live
      messages={[
        user('u1', 'drive the page'),
        assistant('a1', [
          call('b1', 'bash', 'complete'),
          result('b1', 'complete'),
          call('f1', 'page.fill', 'input-complete'),
        ]),
      ]}
    />
  ))

  await expect.element(page.getByText('session live'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: '1 step'})).toBeVisible()
})

it('renders a settled page-session between reply prose without a steps group', async () => {
  mountView(() => (
    <ActivityHarness
      messages={[
        user('u1', 'drive the page'),
        assistant('a1', [
          call('f1', 'page.fill', 'complete'),
          result('f1', 'complete'),
          call('c1', 'page.check', 'complete'),
          result('c1', 'complete'),
          {type: 'text', content: 'Form handled.'},
        ]),
      ]}
    />
  ))

  await expect.element(page.getByText('session settled'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('session acts 2')).toBeVisible()
  await expect.element(page.getByText('Form handled.')).toBeVisible()
  await expect.element(page.getByRole('button', {name: /steps?$/})).not.toBeInTheDocument()
})

it('folds a code-mode run into the session card and absorbs its parent and thinking', async () => {
  mountView(() => (
    <ActivityHarness
      messages={[
        user('u1', 'drive the page through code'),
        assistant('a1', [
          call('p1', 'execute_typescript', 'complete'),
          {type: 'thinking', content: 'pick the field to edit'},
          subCall('s1', 'page.fill', 'p1', 'complete'),
          result('s1', 'complete'),
          result('p1', 'complete'),
        ]),
      ]}
    />
  ))

  await expect.element(page.getByText('session acts 2'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: /steps?$/})).not.toBeInTheDocument()
  await expect.element(page.getByRole('button', {name: 'execute_typescript'})).not.toBeInTheDocument()
})

it('keeps the injected card and its DOM node mounted across streamed act appends', async () => {
  cardMounts.length = 0
  mountView(
    threadHarness(
      {chunks: [...fillChunks('f1', true), ...fillChunks('f2', false)], chunkDelay: 150, runsUntilStopped: true},
      PAGE_SESSION,
    ),
  )

  await page.getByRole('button', {name: 'ask'}).click()
  await expect.element(page.getByText('session acts 1'), {timeout: 3000}).toBeVisible()
  const cardNode = page.getByText(/session acts/).element()

  await expect.element(page.getByText('session acts 2'), {timeout: 3000}).toBeVisible()
  expect(page.getByText(/session acts/).element()).toBe(cardNode)
  expect(cardMounts.length).toBe(1)

  await page.getByRole('button', {name: 'halt'}).click()
  await expect.element(page.getByText('session settled'), {timeout: 3000}).toBeVisible()
  expect(cardMounts.length).toBe(1)
})

it('keeps rendering a streaming empty-thinking chain for non-opted-in consumers', async () => {
  mountView(
    threadHarness({chunks: [...createReasoningChunks(' ', 'empty-thought')], chunkDelay: 1, runsUntilStopped: true}),
  )

  await page.getByRole('button', {name: 'ask'}).click()
  await expect.element(page.getByText('Working…'), {timeout: 3000}).toBeVisible()
  await page.getByRole('button', {name: 'halt'}).click()
})

it('keeps the live session streaming when a trailing foreign result arrives', async () => {
  mountView(
    threadHarness(
      {
        chunks: [
          ...fillChunks('f1', true),
          ...fillChunks('f2', true),
          {
            type: EventType.TOOL_CALL_RESULT,
            messageId: 'foreign-result',
            toolCallId: 'foreign',
            content: '{}',
            state: 'output-available',
          },
        ],
        chunkDelay: 1,
        runsUntilStopped: true,
      },
      PAGE_SESSION,
    ),
  )

  await page.getByRole('button', {name: 'ask'}).click()
  await expect.element(page.getByText('session acts 2'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByText('session live')).toBeVisible()
  await page.getByRole('button', {name: 'halt'}).click()
  await expect.element(page.getByText('session settled'), {timeout: 3000}).toBeVisible()
})

it('hands the folded thinking parts to the injected renderer', async () => {
  mountView(() => (
    <ActivityHarness
      messages={[
        user('u1', 'drive the page through code'),
        assistant('a1', [
          call('p1', 'execute_typescript', 'complete'),
          {type: 'thinking', content: 'choose the field'},
          subCall('s1', 'page.fill', 'p1', 'complete'),
          result('s1', 'complete'),
          result('p1', 'complete'),
        ]),
      ]}
    />
  ))

  await expect.element(page.getByText('session thinking 1'), {timeout: 3000}).toBeVisible()
})

it('renders no phantom card for a parent split from its acts by reply text', async () => {
  mountView(() => (
    <ActivityHarness
      messages={[
        user('u1', 'explain then edit'),
        assistant('a1', [
          call('p1', 'execute_typescript', 'complete'),
          {type: 'text', content: 'first, the plan'},
          subCall('s1', 'page.fill', 'p1', 'complete'),
          result('s1', 'complete'),
        ]),
      ]}
    />
  ))

  await expect.element(page.getByText('session acts 1'), {timeout: 3000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: '1 step'})).toBeVisible()
  expect(page.getByText(/session acts/).elements()).toHaveLength(1)
})
