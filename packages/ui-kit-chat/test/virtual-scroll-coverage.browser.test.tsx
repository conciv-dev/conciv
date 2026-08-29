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
const MIN_COVERAGE = 0.9

type Span = {top: number; bottom: number}

type CoverageSample = {
  scrollTop: number
  coverage: number
  mountedRows: number
  firstIndex: number
  lastIndex: number
}

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

function mountThread(initial: UIMessage[]): () => HTMLElement {
  let viewport: HTMLElement | undefined
  function VirtualThread(): JSX.Element {
    const chat = useChat({connection: storyConnection({chunks: []}), initialMessages: initial})
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
                <Thread.Messages />
              </Thread.Viewport>
            </Thread>
          </ToolProvider>
        </ChatProvider>
      </div>
    )
  }
  mountView(() => <VirtualThread />)
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

function rowGapOf(viewport: HTMLElement): number {
  const parsed = Number.parseFloat(getComputedStyle(viewport).rowGap)
  return Number.isFinite(parsed) ? parsed : 0
}

function indexOfRow(row: HTMLElement): number {
  const parsed = Number.parseInt(row.dataset.index ?? '', 10)
  return Number.isFinite(parsed) ? parsed : -1
}

function clippedSpan(row: HTMLElement, viewportRect: DOMRect, tolerance: number): Span | undefined {
  if (row.textContent === null || row.textContent.trim().length === 0) return undefined
  const rect = row.getBoundingClientRect()
  const top = Math.max(rect.top - tolerance, viewportRect.top)
  const bottom = Math.min(rect.bottom + tolerance, viewportRect.bottom)
  return bottom > top ? {top, bottom} : undefined
}

function coveredLength(spans: Span[], from: number): number {
  const ordered = spans.slice().toSorted((left, right) => left.top - right.top)
  return ordered.reduce(
    (state, span) =>
      span.bottom <= state.reach
        ? state
        : {covered: state.covered + span.bottom - Math.max(span.top, state.reach), reach: span.bottom},
    {covered: 0, reach: from},
  ).covered
}

function coverageOf(viewport: HTMLElement, tolerance: number): CoverageSample {
  const viewportRect = viewport.getBoundingClientRect()
  const rows = Array.from(viewport.querySelectorAll<HTMLElement>('[data-index]'))
  const indexes = rows.map(indexOfRow).filter((index) => index >= 0)
  const spans = rows
    .map((row) => clippedSpan(row, viewportRect, tolerance))
    .filter((span): span is Span => span !== undefined)
  const covered = coveredLength(spans, viewportRect.top)
  return {
    scrollTop: viewport.scrollTop,
    coverage: viewportRect.height > 0 ? covered / viewportRect.height : 0,
    mountedRows: rows.length,
    firstIndex: indexes.length > 0 ? Math.min(...indexes) : -1,
    lastIndex: indexes.length > 0 ? Math.max(...indexes) : -1,
  }
}

async function sweepUpwards(viewport: HTMLElement, stepPx: number): Promise<CoverageSample[]> {
  const tolerance = rowGapOf(viewport) / 2
  const samples: CoverageSample[] = []
  let position = viewport.scrollHeight - viewport.clientHeight
  viewport.scrollTop = position
  await nextFrame()
  while (position > 0) {
    position = Math.max(0, position - stepPx)
    viewport.scrollTop = position
    await nextFrame()
    samples.push(coverageOf(viewport, tolerance))
  }
  return samples
}

function report(label: string, samples: CoverageSample[]): string {
  const coverages = samples.map((sample) => sample.coverage)
  const below = samples.filter((sample) => sample.coverage < MIN_COVERAGE)
  const worst = below
    .slice()
    .toSorted((left, right) => left.coverage - right.coverage)
    .slice(0, 8)
    .map(
      (sample) =>
        `scrollTop=${Math.round(sample.scrollTop)} coverage=${sample.coverage.toFixed(3)} rows=${sample.mountedRows} range=${sample.firstIndex}..${sample.lastIndex}`,
    )
  return [
    `${label}: frames=${samples.length} min=${coverages.length > 0 ? Math.min(...coverages).toFixed(3) : 'no-frames'} framesBelow${MIN_COVERAGE}=${below.length}`,
    ...worst,
  ].join('\n')
}

async function settledThread(): Promise<HTMLElement> {
  const viewport = mountThread(seedMessages(TURN_COUNT))
  await expect.element(page.getByText(`answer ${TURN_COUNT - 1}`, {exact: false}).first()).toBeVisible()
  return viewport()
}

async function escapeFollow(viewport: HTMLElement): Promise<void> {
  await userEvent.wheel(viewport, {delta: {y: -200}})
  await expect.element(page.elementLocator(viewport)).not.toHaveAttribute('data-at-bottom')
}

function resizeLoopErrors(): string[] {
  return windowErrors.filter((message) => message.includes('ResizeObserver loop'))
}

it('keeps the viewport covered by mounted turns while scrolling up at a moderate velocity', async () => {
  const element = await settledThread()

  const samples = await sweepUpwards(element, MODERATE_STEP_PX)
  const summary = report(`sweep@${MODERATE_STEP_PX}px/frame`, samples)

  expect(samples.length > 4, summary).toBe(true)
  expect(Math.min(...samples.map((sample) => sample.coverage)) >= MIN_COVERAGE, summary).toBe(true)
})

it('scrolling a card-heavy thread never trips a ResizeObserver notification loop', async () => {
  const element = await settledThread()
  await sweepUpwards(element, FAST_STEP_PX)
  await escapeFollow(element)
  element.scrollTop = 0
  await expect.element(page.getByText('question 0', {exact: false}).first()).toBeVisible()
  await sweepUpwards(element, MODERATE_STEP_PX)

  expect(resizeLoopErrors()).toEqual([])
})

it('a deep jump re-windows onto the target turn within the overscan', async () => {
  const element = await settledThread()
  await escapeFollow(element)
  element.scrollTop = 0
  await expect.element(page.getByText('question 0', {exact: false}).first()).toBeVisible()
  await expect.element(page.getByText(`answer ${TURN_COUNT - 1}`, {exact: false})).not.toBeInTheDocument()
})
