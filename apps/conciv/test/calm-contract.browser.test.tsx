import '../src/styles.css'
import {expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {coreControl} from './helpers/core-control.js'
import {sendTurn} from './helpers/core-session.js'
import {SCROLL_END_THRESHOLD_PX, VIRTUALIZE_THRESHOLD} from '@conciv/ui-kit-chat'
import {
  pinViewportToBottom,
  threadViewportElement,
  topEdgeRowIndex,
  topEdgeRowOffset,
  watchViewportScroll,
  type CalmWatch,
} from './helpers/calm-assertions.js'
import {forceReducedMotion} from './helpers/reduced-motion.js'
import {watchTextGrowth} from './helpers/growth-watch.js'
import {
  STREAMED_CODE_CLOSING,
  STREAMED_TEXT_CHUNK,
  STREAMED_TEXT_PACE_MS,
  core,
  input,
  mountChatPane,
  multiToolStep,
  type ScriptedToolStep,
  newSession,
  promptWith,
  registerCalmCore,
  seedThread,
  startBoundaryRun,
  startHeldToolRun,
  startMultiToolRun,
  stopButton,
  streamCodeAnswer,
  streamedCodeAnswer,
  watchCalm,
} from './helpers/calm-session.js'

const SHOTS = '__screenshots__/calm-contract'
const MIN_CODE_GROWTH_STEPS = 10
const BOUNDARY_EXCHANGES = Math.floor(VIRTUALIZE_THRESHOLD / 2)
const VIEWPORT_HEIGHT_PX = 600
const SCROLL_UP_PX = 600
const STREAM_STEP_GROWTH_PX = 160
const CATCH_UP_DISTANCE_BUDGET_PX = SCROLL_END_THRESHOLD_PX + STREAM_STEP_GROWTH_PX
const MIN_SCROLL_SAMPLES = 20
const SCROLL_GATE_STEPS = 24
const SCROLL_GATE_PACE_MS = 100
const SCROLL_GATE_TEXT_PACE_MS = 100
const SCROLL_GATE_EXCHANGES = 24
const CATCH_UP_FRAME_BUDGET = 3
const FOLD_GATE_SCROLL_PX = 170
const ROW_ROUNDING_TOLERANCE_PX = 4

registerCalmCore('calm-contract')

const sendButton = () => page.getByRole('button', {name: 'Send message'})
const traceToggle = () => page.getByText(/^(Show|Hide) trace$/)
const permissionRequest = () => page.getByRole('group', {name: 'Permission request'})

function expectCalm(watch: CalmWatch): void {
  expect(watch.removed()).toEqual([])
  expect(watch.drifted()).toEqual([])
  expect(watch.narrationGlyphs()).toBeLessThanOrEqual(1)
  expect(watch.shiftedAboveLiveRegion()).toEqual([])
}

test('surface immortality and stillness across a multi-tool run [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
  const watch = await startMultiToolRun()
  await page.screenshot({path: `${SHOTS}/multi-tool-mid-stream.png`})
  expectCalm(watch)

  await coreControl.releaseTurn()
  await expect.element(page.getByText('All twenty steps are done.')).toBeVisible()
  await watch.checkpoint()
  await page.screenshot({path: `${SHOTS}/multi-tool-settled.png`})
  expectCalm(watch)
})

test('a second run leaves the first run untouched [mechanism B: wrong streaming bit, thread.tsx:275-279]', async () => {
  const {sessionId} = await newSession()
  await coreControl.scriptTurn({toolCalls: [{name: 'Bash', input: {command: 'ls'}}], text: 'First answer.'})
  mountChatPane(sessionId)

  await promptWith('first question')
  await expect.element(page.getByText('First answer.')).toBeVisible()
  const watch = watchCalm()
  await watch.checkpoint()

  await coreControl.scriptTurn({toolCalls: [{name: 'Read', input: {filePath: 'second.ts'}}], text: 'Second answer.'})
  await coreControl.holdTools()
  await coreControl.holdResults()
  await coreControl.holdTurn()
  await promptWith('second question')
  await expect.element(stopButton()).toBeVisible()
  await watch.checkpoint()
  expect(watch.removed()).toEqual([])
  await watch.checkpoint({rebaseline: true})

  await coreControl.releaseTools()
  await expect.element(page.getByText('second.ts', {exact: true})).toBeVisible()
  await watch.checkpoint()
  await coreControl.releaseResults()
  await expect.element(page.getByText('Second answer.', {exact: true})).toBeVisible()
  await watch.checkpoint()
  await page.screenshot({path: `${SHOTS}/interleave-mid-stream.png`})
  expectCalm(watch)

  await coreControl.releaseTurn()
  await watch.checkpoint()
  expectCalm(watch)
})

test('an approval pause and resume keeps every surface in place [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
  const {sessionId} = await newSession()
  const ids = await coreControl.scriptTurn({
    toolCalls: [{name: 'Bash', input: {command: 'rm -rf build'}}],
    text: 'Approved and finished.',
  })
  await coreControl.scriptCustomEvent('approval-requested', {
    toolCallId: ids[0],
    toolName: 'Bash',
    input: {command: 'rm -rf build'},
    approval: {id: 'calm-ask-1', needsApproval: true},
  })
  await coreControl.holdResults()
  await coreControl.holdTurn()
  mountChatPane(sessionId)

  await promptWith('delete the build directory')
  await expect.element(permissionRequest()).toBeVisible()
  const watch = watchCalm()
  await watch.checkpoint()
  await page.screenshot({path: `${SHOTS}/approval-paused.png`})

  await page.getByRole('button', {name: 'Approve'}).click()
  await coreControl.releaseResults()
  await coreControl.releaseTurn()
  await expect.element(page.getByText('Approved and finished.')).toBeVisible()
  await watch.checkpoint()
  await page.screenshot({path: `${SHOTS}/approval-resumed.png`})
  expectCalm(watch)
})

test('a run parked on an unresolved tool call settles in place when the next run starts [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
  const {sessionId} = await newSession()
  await coreControl.scriptToolCall('Bash', {command: 'sleep forever'})
  mountChatPane(sessionId)

  await promptWith('start something that never finishes')
  await expect.element(page.getByText('sleep forever', {exact: true})).toBeVisible()
  const watch = watchCalm()
  await watch.checkpoint()
  await page.screenshot({path: `${SHOTS}/parked-on-tool-call.png`})
  expectCalm(watch)

  await coreControl.scriptTurn({toolCalls: [], text: 'Picked up where the parked call stopped.'})
  await promptWith('carry on without it')
  await watch.checkpoint({rebaseline: true})
  await expect.element(page.getByText('Picked up where the parked call stopped.')).toBeVisible()
  await watch.checkpoint()
  await page.screenshot({path: `${SHOTS}/parked-resumed.png`})
  expectCalm(watch)
})

test('an error mid-run replaces nothing above the live region [mechanism B: wrong streaming bit, thread.tsx:275-279]', async () => {
  const {sessionId} = await newSession()
  await coreControl.scriptTurn({toolCalls: [{name: 'Bash', input: {command: 'ls'}}], text: 'never delivered'})
  mountChatPane(sessionId)

  const watch = watchCalm({allow: ['error-replacement']})
  await coreControl.holdTurn()
  await promptWith('run a tool then fail')
  await expect.element(stopButton()).toBeVisible()
  await watch.checkpoint({rebaseline: true})

  await coreControl.scriptError('the scripted run failed')
  await coreControl.releaseTurn()
  await expect.element(page.getByRole('alert').first()).toBeVisible()
  await watch.checkpoint()
  await page.screenshot({path: `${SHOTS}/error-mid-run.png`})
  expectCalm(watch)
})

test('cancelling a run settles every surface in place [mechanism B: wrong streaming bit, thread.tsx:275-279]', async () => {
  const {sessionId} = await newSession()
  await coreControl.scriptTurn({toolCalls: [{name: 'Bash', input: {command: 'ls'}}], text: 'partial answer'})
  mountChatPane(sessionId)

  const watch = await startHeldToolRun({
    prompt: 'start something cancellable',
    pending: 'ls',
    settled: 'partial answer',
  })
  await stopButton().click()
  await expect.element(page.getByRole('button', {name: 'Send message'})).toBeVisible()
  await watch.checkpoint()
  await page.screenshot({path: `${SHOTS}/cancelled.png`})
  expectCalm(watch)
})

test('a pane remounted mid-run rejoins without churning its surfaces [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
  const {sessionId} = await newSession()
  await coreControl.scriptTurn({
    toolCalls: [{name: 'Bash', input: {command: 'rejoin probe'}}],
    text: 'Finished after reload.',
  })
  await coreControl.holdTools()
  await coreControl.holdResults()
  await coreControl.holdTurn()
  await sendTurn(core.base, sessionId, 'a turn started before the reload')

  mountChatPane(sessionId)
  await expect.element(input()).toBeVisible()
  await expect.element(stopButton()).toBeVisible()
  const watch = watchCalm()
  await watch.checkpoint()

  await coreControl.releaseTools()
  await expect.element(page.getByText('rejoin probe', {exact: true})).toBeVisible()
  await watch.checkpoint()

  await coreControl.releaseResults()
  await coreControl.releaseTurn()
  await expect.element(page.getByText('Finished after reload.')).toBeVisible()
  await watch.checkpoint()
  await page.screenshot({path: `${SHOTS}/reload-mid-run.png`})
  expectCalm(watch)
})

test('toggling the trace mid-run keeps the surrounding surfaces still [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
  const {sessionId} = await newSession()
  await coreControl.scriptTurn({
    toolCalls: [
      {name: 'Bash', input: {command: 'ls'}},
      {name: 'Read', input: {filePath: 'calm.ts'}},
    ],
    text: 'The trace survived the toggle.',
  })
  mountChatPane(sessionId)

  const watch = watchCalm({allow: ['user-collapsed-trace']})
  await coreControl.holdTools()
  await coreControl.holdTurn()
  await promptWith('run two tools while I fold the trace')
  await expect.element(stopButton()).toBeVisible()
  await watch.checkpoint({rebaseline: true})

  await coreControl.releaseTools()
  await expect.element(traceToggle()).toBeVisible()
  await watch.checkpoint()
  await traceToggle().click()
  await expect.element(traceToggle()).toBeVisible()
  await watch.checkpoint({rebaseline: true})
  await traceToggle().click()
  await expect.element(traceToggle()).toBeVisible()
  await watch.checkpoint({rebaseline: true})
  await page.screenshot({path: `${SHOTS}/trace-toggled.png`})
  expectCalm(watch)

  await coreControl.releaseTurn()
  await expect.element(page.getByText('The trace survived the toggle.')).toBeVisible()
  await watch.checkpoint()
  expectCalm(watch)
})

test('a run under reduced motion stays as still as one with motion [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
  const restoreMotion = forceReducedMotion()
  try {
    const {sessionId} = await newSession()
    await coreControl.scriptTurn({
      toolCalls: [
        {name: 'Bash', input: {command: 'quiet probe'}},
        {name: 'Read', input: {filePath: 'calm.ts'}},
      ],
      text: 'Both steps are done.',
    })
    mountChatPane(sessionId)

    const watch = await startHeldToolRun({prompt: 'run two tools quietly', pending: 'quiet probe', settled: 'calm.ts'})
    expectCalm(watch)

    await coreControl.releaseTurn()
    await expect.element(page.getByText('Both steps are done.')).toBeVisible()
    await watch.checkpoint()
    await page.screenshot({path: `${SHOTS}/reduced-motion.png`})
    expectCalm(watch)
  } finally {
    restoreMotion()
  }
})

test('a long thread at the virtualization boundary stays still while a run streams [mechanism C: retroactive regrouping, page-session.ts:141-151]', async () => {
  const watch = await startBoundaryRun()
  expectCalm(watch)

  await coreControl.releaseTurn()
  await expect.element(page.getByText('The long thread is done.')).toBeVisible()
  await watch.checkpoint()
  await page.screenshot({path: `${SHOTS}/virtualization-boundary.png`})
  expectCalm(watch)
}, 120_000)

test('a thread crossing the virtualization threshold mid-run keeps its visible surfaces [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
  const {sessionId} = await newSession()
  await seedThread(core.base, sessionId, BOUNDARY_EXCHANGES)
  await coreControl.scriptTurn({
    toolCalls: [{name: 'Bash', input: {command: 'cross the boundary'}}],
    text: 'Crossed the boundary.',
  })
  mountChatPane(sessionId)
  await expect.element(page.getByText(`seeded exchange ${BOUNDARY_EXCHANGES - 1}`, {exact: true})).toBeVisible()
  const restoreViewport = pinViewportToBottom(VIEWPORT_HEIGHT_PX)
  try {
    const watch = await startHeldToolRun({
      prompt: 'push the thread past the boundary',
      pending: 'cross the boundary',
      settled: 'Crossed the boundary.',
      allow: {allow: ['virtualization']},
    })
    await page.screenshot({path: `${SHOTS}/threshold-crossing.png`})
    expectCalm(watch)

    await coreControl.releaseTurn()
    await watch.checkpoint()
    expectCalm(watch)
  } finally {
    restoreViewport()
  }
}, 120_000)

test('a streamed code block stays calm [mechanism D: per-chunk re-tokenisation, render-sync.ts:19-24]', async () => {
  const watch = await streamCodeAnswer()
  await page.screenshot({path: `${SHOTS}/streamed-code-block.png`})
  expectCalm(watch)
}, 120_000)

test('a streamed code block grows on screen while it streams [mechanism D: render suppressed until settle]', async () => {
  const {sessionId} = await newSession()
  await coreControl.scriptTurn({
    toolCalls: [],
    text: streamedCodeAnswer(),
    textPace: {chunk: STREAMED_TEXT_CHUNK, everyMs: STREAMED_TEXT_PACE_MS},
  })
  mountChatPane(sessionId)

  await coreControl.holdTools()
  await promptWith('write the helper that resolves every step')
  await expect.element(stopButton()).toBeVisible()
  const growth = watchTextGrowth(() => [...document.querySelectorAll('.prose-chat pre')].at(-1) ?? null)

  await coreControl.releaseTools()
  await expect.element(page.getByText(STREAMED_CODE_CLOSING, {exact: true})).toBeVisible()
  growth.stop()

  const lengths = growth.lengths()
  expect(lengths.toSorted((left, right) => left - right)).toEqual(lengths)
  expect(lengths.length).toBeGreaterThanOrEqual(MIN_CODE_GROWTH_STEPS)
}, 120_000)

function scrollGateSteps(): ScriptedToolStep[] {
  return Array.from({length: SCROLL_GATE_STEPS}, (_, index): ScriptedToolStep => multiToolStep(index))
}

type ScrollGate = {viewport: HTMLElement; restore: () => void}

async function seededScrollGate(): Promise<ScrollGate> {
  const {sessionId} = await newSession()
  await seedThread(core.base, sessionId, SCROLL_GATE_EXCHANGES)
  await coreControl.scriptTurn({
    toolCalls: scrollGateSteps(),
    text: streamedCodeAnswer(),
    textPace: {chunk: STREAMED_TEXT_CHUNK, everyMs: SCROLL_GATE_TEXT_PACE_MS},
  })
  mountChatPane(sessionId)
  await expect.element(page.getByText(`seeded exchange ${SCROLL_GATE_EXCHANGES - 1}`, {exact: true})).toBeVisible()
  const restore = pinViewportToBottom(VIEWPORT_HEIGHT_PX)
  return {viewport: threadViewportElement(), restore}
}

test('a reader who scrolled up keeps their exact position for the whole stream [gate a: released user never moves]', async () => {
  const gate = await seededScrollGate()
  try {
    await coreControl.holdTools()
    await coreControl.holdResults()
    await promptWith('run the whole batch while I read back')
    await expect.element(stopButton()).toBeVisible()

    await userEvent.wheel(gate.viewport, {delta: {y: -SCROLL_UP_PX}})
    await expect.element(page.elementLocator(gate.viewport)).not.toHaveAttribute('data-at-bottom')
    const rowBefore = topEdgeRowIndex(gate.viewport)
    expect(rowBefore, 'no thread row crosses the viewport top after the wheel').not.toBeNull()
    const watch = watchViewportScroll()

    await coreControl.releaseTools()
    await coreControl.releaseResults({everyMs: SCROLL_GATE_PACE_MS})
    await expect.element(sendButton()).toBeVisible()
    watch.stop()

    expect(watch.samples()).toBeGreaterThanOrEqual(MIN_SCROLL_SAMPLES)
    expect(watch.maxDrift()).toBe(0)
    expect(watch.topEdgeRow()).toBe(rowBefore)
    await expect.element(page.elementLocator(gate.viewport)).not.toHaveAttribute('data-at-bottom')
    await page.screenshot({path: `${SHOTS}/released-reader-held.png`})
  } finally {
    gate.restore()
  }
}, 120_000)

test('a reader parked at the end follows the whole stream [gate b: at-bottom user follows]', async () => {
  const gate = await seededScrollGate()
  try {
    await coreControl.holdTools()
    await coreControl.holdResults()
    await promptWith('run the whole batch while I watch the tail')
    await expect.element(stopButton()).toBeVisible()
    const watch = watchViewportScroll()

    await coreControl.releaseTools()
    await coreControl.releaseResults({everyMs: SCROLL_GATE_PACE_MS})
    await expect.element(page.getByText(STREAMED_CODE_CLOSING, {exact: true})).toBeVisible()
    watch.stop()

    expect(watch.samples()).toBeGreaterThanOrEqual(MIN_SCROLL_SAMPLES)
    const series = watch
      .distanceSeries()
      .map((value) => Math.round(value))
      .join(' ')
    expect(watch.framesBeyond(SCROLL_END_THRESHOLD_PX), series).toBeLessThanOrEqual(CATCH_UP_FRAME_BUDGET)
    expect(Math.round(watch.maxDistanceFromEnd()), series).toBeLessThanOrEqual(CATCH_UP_DISTANCE_BUDGET_PX)
    await expect.element(page.elementLocator(gate.viewport)).toHaveAttribute('data-at-bottom', '')
    await page.screenshot({path: `${SHOTS}/following-reader-pinned.png`})
  } finally {
    gate.restore()
  }
}, 120_000)

test('an appended turn never drags a reader who scrolls up while it streams [gate f: follow-on-append lands once]', async () => {
  const gate = await seededScrollGate()
  try {
    await coreControl.holdTools()
    await coreControl.holdResults()
    await promptWith('run the whole batch while I scroll back')
    await expect.element(stopButton()).toBeVisible()
    await coreControl.releaseTools()
    await coreControl.releaseResults({everyMs: SCROLL_GATE_PACE_MS})
    await expect.element(page.getByText('probe step 2', {exact: true})).toBeVisible()

    await userEvent.wheel(gate.viewport, {delta: {y: -SCROLL_UP_PX}})
    await expect.element(page.elementLocator(gate.viewport)).not.toHaveAttribute('data-at-bottom')
    const rowBefore = topEdgeRowIndex(gate.viewport)
    expect(rowBefore, 'no thread row crosses the viewport top after the wheel').not.toBeNull()
    const offsetBefore = topEdgeRowOffset(gate.viewport)
    const watch = watchViewportScroll()

    await expect.element(sendButton()).toBeVisible()
    watch.stop()

    expect(watch.samples()).toBeGreaterThanOrEqual(MIN_SCROLL_SAMPLES)
    expect(watch.topEdgeRow()).toBe(rowBefore)
    expect(watch.maxDrift()).toBe(0)
    expect(Math.abs(offsetBefore - topEdgeRowOffset(gate.viewport))).toBeLessThanOrEqual(ROW_ROUNDING_TOLERANCE_PX)
    await expect.element(page.elementLocator(gate.viewport)).not.toHaveAttribute('data-at-bottom')
    await page.screenshot({path: `${SHOTS}/appended-turn-holds-reader.png`})
  } finally {
    gate.restore()
  }
}, 120_000)

test('sending a prompt after scrolling up returns the viewport to the end [gate c: send is a gesture]', async () => {
  const gate = await seededScrollGate()
  try {
    await userEvent.wheel(gate.viewport, {delta: {y: -SCROLL_UP_PX}})
    await expect.element(page.elementLocator(gate.viewport)).not.toHaveAttribute('data-at-bottom')

    await coreControl.holdTools()
    await promptWith('take me back to the end')
    await expect.element(page.elementLocator(gate.viewport)).toHaveAttribute('data-at-bottom', '')
    await page.screenshot({path: `${SHOTS}/send-returns-to-end.png`})
  } finally {
    gate.restore()
  }
}, 120_000)

test('folding a card leaves a released reader exactly where they were [gate e: size compensation]', async () => {
  const {sessionId} = await newSession()
  await seedThread(core.base, sessionId, SCROLL_GATE_EXCHANGES)
  await coreControl.scriptTurn({
    toolCalls: [
      {name: 'Bash', input: {command: 'ls'}},
      {name: 'Read', input: {filePath: 'calm.ts'}},
    ],
    text: 'The fold left the reader alone.',
  })
  mountChatPane(sessionId)
  await expect.element(page.getByText(`seeded exchange ${SCROLL_GATE_EXCHANGES - 1}`, {exact: true})).toBeVisible()
  await promptWith('run two tools then answer')
  await expect.element(page.getByText('The fold left the reader alone.')).toBeVisible()
  await expect.element(traceToggle()).toBeVisible()

  const viewport = threadViewportElement()
  const restoreViewport = pinViewportToBottom(VIEWPORT_HEIGHT_PX)
  try {
    await userEvent.wheel(viewport, {delta: {y: -FOLD_GATE_SCROLL_PX}})
    await expect.element(page.elementLocator(viewport)).not.toHaveAttribute('data-at-bottom')
    const rowBefore = topEdgeRowIndex(viewport)
    const offsetBefore = topEdgeRowOffset(viewport)

    await traceToggle().click()
    await expect.element(traceToggle()).toBeVisible()
    await traceToggle().click()
    await expect.element(traceToggle()).toBeVisible()

    expect(topEdgeRowIndex(viewport)).toBe(rowBefore)
    expect(Math.abs(offsetBefore - topEdgeRowOffset(viewport))).toBeLessThanOrEqual(ROW_ROUNDING_TOLERANCE_PX)
    await page.screenshot({path: `${SHOTS}/fold-beside-released-reader.png`})
  } finally {
    restoreViewport()
  }
}, 120_000)
