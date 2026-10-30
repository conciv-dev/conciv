import 'virtual:uno.css'
import type {JSX} from 'solid-js'
import {page, userEvent} from 'vitest/browser'
import {beforeEach, expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {UIMessage} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ChatProvider} from '../src/store/chat-context.js'
import {ToolProvider} from '../src/store/tool-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {mountView} from './mount-view.js'

const TURN_COUNT = 80
const MODERATE_STEP_PX = 200
const FAST_STEP_PX = 800
const MAX_WHEEL_STEPS = 400

const windowErrors: string[] = []
window.addEventListener('error', (event) => {
  windowErrors.push(typeof event.message === 'string' ? event.message : String(event))
})

beforeEach(() => {
  windowErrors.length = 0
})

function answerOf(index: number): string {
  const shape = index % 4
  if (shape === 0) return `answer ${index}\n\nOne short line about the change.`
  if (shape === 1) {
    return `answer ${index}\n\n## Findings\n\n${['alpha', 'beta', 'gamma', 'delta']
      .map((name) => `- \`${name}\` ${'holds the shared lane. '.repeat(3)}`)
      .join('\n')}`
  }
  if (shape === 2) {
    return `answer ${index}\n\n${'The scheduler drains the queue in order. '.repeat(12)}\n\n${'It retries only the tail. '.repeat(10)}`
  }
  return `answer ${index}\n\n${'Then the caller folds the result. '.repeat(6)}`
}

function assistantParts(index: number): UIMessage['parts'] {
  if (index % 4 !== 3) return [{type: 'text', content: answerOf(index)}]
  return [
    {type: 'text', content: `answer ${index}\n\nReading the file first.`},
    {
      type: 'tool-call',
      id: `call-${index}`,
      name: 'Read',
      arguments: JSON.stringify({file: `src/module-${index}.ts`}),
      input: {file: `src/module-${index}.ts`},
      state: 'complete',
    },
    {
      type: 'tool-result',
      toolCallId: `call-${index}`,
      content: `export function run(step: number): number {\n  return step * ${index}\n}\n`.repeat(4),
      state: 'complete',
    },
    {type: 'text', content: answerOf(index)},
  ]
}

function seedMessages(count: number): UIMessage[] {
  const messages: UIMessage[] = []
  for (let index = 0; index < count; index++) {
    const id = `m${index}`
    messages.push(
      index % 2 === 0
        ? {
            id,
            role: 'user',
            parts: [{type: 'text', content: `question ${index}. ${'why does it stall? '.repeat(index % 6)}`}],
          }
        : {id, role: 'assistant', parts: assistantParts(index)},
    )
  }
  return messages
}

function baseToolCtx(): ToolViewCtx {
  return {
    apiBase: '',
    harnessId: 'test',
    sendMessage: () => {},
    catalog: {loaded: () => true, meta: () => undefined},
    addResult: () => {},
  }
}

function mountThread(initial: UIMessage[]): void {
  function VirtualThread(): JSX.Element {
    const chat = useChat({connection: storyConnection({chunks: []}), initialMessages: initial})
    return (
      <div class="flex flex-col h-[520px] w-[560px]">
        <ChatProvider chat={chat}>
          <ToolProvider value={baseToolCtx()}>
            <Thread>
              <Thread.Viewport>
                <Thread.Messages />
              </Thread.Viewport>
            </Thread>
          </ToolProvider>
        </ChatProvider>
      </div>
    )
  }
  mountView(() => <VirtualThread />)
}

async function firstTurnVisible(): Promise<boolean> {
  try {
    await expect.element(page.getByText('question 0', {exact: false}).first(), {timeout: 50}).toBeVisible()
    return true
  } catch {
    return false
  }
}

async function sweepUpwards(stepPx: number): Promise<void> {
  for (let step = 0; step < MAX_WHEEL_STEPS; step++) {
    if (await firstTurnVisible()) return
    await userEvent.wheel(page.getByRole('log'), {delta: {y: -stepPx}})
  }
  throw new Error(`question 0 not visible after ${MAX_WHEEL_STEPS} wheel steps of ${stepPx}px`)
}

async function lastTurnVisible(): Promise<void> {
  await expect.element(page.getByText(`answer ${TURN_COUNT - 1}`, {exact: false}).first()).toBeVisible()
}

async function settledThread(): Promise<void> {
  mountThread(seedMessages(TURN_COUNT))
  await lastTurnVisible()
}

async function wheelToFirstTurn(): Promise<void> {
  await userEvent.wheel(page.getByRole('log'), {delta: {y: -1_000_000}})
  await expect.element(page.getByText('question 0', {exact: false}).first()).toBeVisible()
}

function resizeLoopErrors(): string[] {
  return windowErrors.filter((message) => message.includes('ResizeObserver loop'))
}

it('scrolling a card-heavy thread never trips a ResizeObserver notification loop', async () => {
  await settledThread()
  await sweepUpwards(FAST_STEP_PX)
  await userEvent.wheel(page.getByRole('log'), {delta: {y: 1_000_000}})
  await lastTurnVisible()
  await sweepUpwards(MODERATE_STEP_PX)

  expect(resizeLoopErrors()).toEqual([])
})

it('a deep jump re-windows onto the target turn within the overscan', async () => {
  await settledThread()
  await wheelToFirstTurn()
  await expect.element(page.getByText(`answer ${TURN_COUNT - 1}`, {exact: false})).not.toBeInTheDocument()
})
