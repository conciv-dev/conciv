import 'virtual:uno.css'
import '@conciv/ui-kit-system/tokens.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import type {JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {useChat} from '@tanstack/ai-solid'
import type {MessagePart, UIMessage} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ChatProvider} from '../src/store/chat-context.js'
import {ToolProvider} from '../src/store/tool-context.js'
import {storyConnection} from '../src/store/story-connection.js'
import {Thread} from '../src/styled/thread.js'
import {coalesceTurns} from '../src/store/grouping.js'
import {createGrouping} from '../src/store/page-session.js'
import {createTurnEstimator} from '../src/styled/text-metrics.js'
import {toolFallbackCardView} from '../src/tools/styled/tool-fallback.js'
import {mountView} from './mount-view.js'

const TURN_COUNT = 30
const MEDIAN_ERROR_LIMIT = 0.02
const P90_ERROR_LIMIT = 0.05
const MAX_ERROR_LIMIT = 0.08

const STANDALONE_ENTRIES: ToolCardEntry[] = [{...toolFallbackCardView, names: ['Read', 'Edit'], display: 'standalone'}]

function resultLines(index: number, count: number): string {
  return Array.from(
    {length: count},
    (_, line) => `export function step${index}_${line}(value: number): number {\n  return value * ${line}\n}`,
  ).join('\n')
}

function callPart(index: number, name: string, input: Record<string, unknown>, output: string): MessagePart {
  return {
    type: 'tool-call',
    id: `call-${index}-${name}`,
    name,
    arguments: JSON.stringify(input),
    input,
    state: 'complete',
    output,
  }
}

function chainTurn(index: number): MessagePart[] {
  const calls = 1 + (index % 5)
  return [
    {type: 'thinking', content: `Working out the ${index}th step.\nChecking the call sites before editing.`},
    ...Array.from({length: calls}, (_, call) =>
      callPart(index, 'bash', {command: `grep -rn symbol-${index}-${call} src`}, resultLines(index, 1 + call * 4)),
    ),
    {
      type: 'text',
      content: `answer ${index}\n\n${'The scheduler drains the queue in order. '.repeat(2 + (index % 6))}`,
    },
  ]
}

function standaloneTurn(index: number): MessagePart[] {
  return [
    {type: 'text', content: `answer ${index}\n\nReading the module first.`},
    callPart(
      index,
      index % 2 === 0 ? 'Read' : 'Edit',
      {file: `src/module-${index}.ts`},
      resultLines(index, 3 + (index % 14)),
    ),
    {type: 'text', content: `answer ${index} done. ${'It retries only the tail. '.repeat(1 + (index % 4))}`},
  ]
}

function assistantParts(index: number): MessagePart[] {
  return index % 3 === 0 ? standaloneTurn(index) : chainTurn(index)
}

function seedMessages(): UIMessage[] {
  return Array.from({length: TURN_COUNT + 1}, (_, index) =>
    index % 2 === 0
      ? ({
          id: `m${index}`,
          role: 'user',
          parts: [{type: 'text', content: `question ${index}. ${'why does it stall? '.repeat(1 + (index % 5))}`}],
        } satisfies UIMessage)
      : ({id: `m${index}`, role: 'assistant', parts: assistantParts(index)} satisfies UIMessage),
  )
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

function mountThread(messages: UIMessage[]): () => HTMLElement {
  let viewport: HTMLElement | undefined
  function CalibrationThread(): JSX.Element {
    const chat = useChat({connection: storyConnection({chunks: []}), initialMessages: messages})
    return (
      <div class="flex flex-col h-[520px] w-[560px]">
        <ChatProvider chat={chat}>
          <ToolProvider value={baseToolCtx()}>
            <Thread>
              <Thread.Viewport
                ref={(element) => {
                  viewport = element
                }}
              >
                <Thread.Messages tools={STANDALONE_ENTRIES} />
              </Thread.Viewport>
            </Thread>
          </ToolProvider>
        </ChatProvider>
      </div>
    )
  }
  mountView(() => <CalibrationThread />)
  return () => {
    if (!viewport) throw new Error('viewport not mounted')
    return viewport
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function collectHeights(viewport: HTMLElement, into: Map<number, number>): void {
  for (const row of viewport.querySelectorAll<HTMLElement>('[data-index]')) {
    const index = Number.parseInt(row.dataset.index ?? '', 10)
    const height = row.getBoundingClientRect().height
    if (Number.isFinite(index) && height > 0) into.set(index, height)
  }
}

async function sweepMeasured(viewport: HTMLElement): Promise<Map<number, number>> {
  const measured = new Map<number, number>()
  viewport.scrollTop = viewport.scrollHeight
  await nextFrame()
  await nextFrame()
  collectHeights(viewport, measured)
  while (viewport.scrollTop > 1) {
    viewport.scrollTop = Math.max(0, viewport.scrollTop - viewport.clientHeight / 2)
    await nextFrame()
    await nextFrame()
    collectHeights(viewport, measured)
  }
  return measured
}

function median(values: number[]): number {
  const ordered = values.slice().toSorted((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  if (ordered.length === 0) return Number.NaN
  if (ordered.length % 2 === 1) return ordered[middle] ?? Number.NaN
  return ((ordered[middle - 1] ?? Number.NaN) + (ordered[middle] ?? Number.NaN)) / 2
}

function quantile(values: number[], fraction: number): number {
  const ordered = values.slice().toSorted((left, right) => left - right)
  const at = Math.min(ordered.length - 1, Math.max(0, Math.round(fraction * (ordered.length - 1))))
  return ordered[at] ?? Number.NaN
}

it('estimates settled turn heights within a fiftieth of their measured height', async () => {
  const messages = seedMessages()
  const viewport = mountThread(messages)
  await expect.element(page.getByText('question 0', {exact: false}).first()).toBeVisible()
  const element = viewport()
  const measured = await sweepMeasured(element)

  const estimator = createTurnEstimator(() => element, {
    grouping: () => createGrouping(undefined, STANDALONE_ENTRIES),
  })
  const turns = coalesceTurns(messages)
  const rows = turns.slice(0, -1).flatMap((turn, index) => {
    const height = measured.get(index)
    const estimate = estimator.estimateTurn(turn)
    if (height === undefined || estimate === undefined) return []
    return [
      {index, role: turn.role, height, estimate: estimate.height, error: Math.abs(estimate.height - height) / height},
    ]
  })

  const errors = rows.map((row) => row.error)
  const summary = [
    `covered=${rows.length}/${turns.length - 1} median=${median(errors).toFixed(3)} p90=${quantile(errors, 0.9).toFixed(3)} max=${Math.max(...errors).toFixed(3)}`,
    ...rows
      .slice()
      .toSorted((left, right) => right.error - left.error)
      .slice(0, 10)
      .map(
        (row) =>
          `#${row.index} ${row.role} measured=${row.height.toFixed(0)} estimate=${row.estimate.toFixed(0)} error=${row.error.toFixed(2)}`,
      ),
  ].join('\n')

  expect(rows.length === turns.length - 1, summary).toBe(true)
  expect(median(errors) <= MEDIAN_ERROR_LIMIT, summary).toBe(true)
  expect(quantile(errors, 0.9) <= P90_ERROR_LIMIT, summary).toBe(true)
  expect(Math.max(...errors) <= MAX_ERROR_LIMIT, summary).toBe(true)
})
