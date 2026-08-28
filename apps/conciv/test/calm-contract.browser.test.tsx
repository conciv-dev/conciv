import '../src/styles.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {RpcClient} from '@conciv/contract'
import {ChatPane} from '../src/pane/chat-pane.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession, openTranscriptStream, sendTurn} from './helpers/core-session.js'
import {mountPane, type PaneMount} from './helpers/pane-harness.js'
import {VIRTUALIZE_THRESHOLD} from '@conciv/ui-kit-chat'
import {createCalmWatch, pinViewportToBottom, type CalmWatch} from './helpers/calm-assertions.js'
import {forceReducedMotion} from './helpers/reduced-motion.js'

const SHOTS = '__screenshots__/calm-contract'
const MULTI_TOOL_STEPS = 20
const FRAME_P95_BUDGET_MS = 20
const FRAME_JANK_BUDGET = 2
const MIN_SAMPLED_FRAMES = 40
const MULTI_TOOL_PACE_MS = 50
const BOUNDARY_PACE_MS = 400
const EDIT_STEP_INTERVAL = 5
const DIFF_BEFORE = [
  'export function total(items: Item[]): number {',
  '  let sum = 0',
  '  for (const item of items) sum += item.price',
  '  return sum',
  '}',
].join('\n')
const DIFF_AFTER = [
  'export function total(items: readonly Item[]): number {',
  '  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)',
  '}',
].join('\n')
const STREAMED_CODE_LINES = 40
const STREAMED_TEXT_CHUNK = 56
const STREAMED_TEXT_PACE_MS = 30
const STREAMED_CODE_CLOSING = 'That is the whole helper.'
const SEEDED_EXCHANGES = Math.floor((VIRTUALIZE_THRESHOLD - 4) / 2)
const BOUNDARY_EXCHANGES = Math.floor(VIRTUALIZE_THRESHOLD / 2)
const VIEWPORT_HEIGHT_PX = 600

const core = {base: ''}
const active: {pane: PaneMount | null; watch: CalmWatch | null} = {pane: null, watch: null}

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'calm-contract', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(async () => {
  active.watch?.stop()
  active.watch = null
  await coreControl.releaseTools()
  await coreControl.releaseResults()
  await coreControl.releaseTurn()
  active.pane?.dispose()
  active.pane = null
})

async function newSession(): Promise<{rpc: RpcClient; sessionId: string}> {
  const rpc = coreRpc(core.base)
  return {rpc, sessionId: await createSession(rpc)}
}

function mountChatPane(sessionId: string): PaneMount {
  const mount = mountPane({base: core.base, sessionId}, () => <ChatPane sessionId={sessionId} />)
  active.pane = mount
  return mount
}

function watchCalm(allow: Parameters<typeof createCalmWatch>[0] = {}): CalmWatch {
  const watch = createCalmWatch(allow)
  active.watch = watch
  return watch
}

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const stopButton = () => page.getByRole('button', {name: 'Stop generating'})
const traceToggle = () => page.getByText(/^(Show|Hide) trace$/)
const permissionRequest = () => page.getByRole('group', {name: 'Permission request'})

async function promptWith(text: string): Promise<void> {
  await expect.element(input()).toBeVisible()
  await input().fill(text)
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByText(text)).toBeVisible()
}

type ScriptedToolStep = {name: string; input: Record<string, string>}

function editStep(index: number): ScriptedToolStep {
  return {name: 'Edit', input: {file_path: `step-${index}.tsx`, old_string: DIFF_BEFORE, new_string: DIFF_AFTER}}
}

function multiToolStep(index: number): ScriptedToolStep {
  if (index > 0 && index % EDIT_STEP_INTERVAL === 0) return editStep(index)
  if (index % 2 === 0) return {name: 'Bash', input: {command: `probe step ${index}`}}
  return {name: 'Read', input: {filePath: `step-${index}.tsx`}}
}

function multiToolSteps(): ScriptedToolStep[] {
  return Array.from({length: MULTI_TOOL_STEPS}, (_, index): ScriptedToolStep => multiToolStep(index))
}

function streamedCodeLine(index: number): string {
  return `  const step${index} = await resolve(input.steps[${index}], {retries: ${index % 4}})`
}

function streamedCodeAnswer(): string {
  return [
    'Here is the helper you asked for.',
    '',
    '```ts',
    'export async function resolveEveryStep(input: PipelineInput): Promise<StepResult[]> {',
    ...Array.from({length: STREAMED_CODE_LINES}, (_, index) => streamedCodeLine(index)),
    '  return [step0]',
    '}',
    '```',
    '',
    STREAMED_CODE_CLOSING,
  ].join('\n')
}

function expectSmooth(watch: CalmWatch): void {
  const gaps = watch.frameGaps()
  expect(gaps.frames).toBeGreaterThanOrEqual(MIN_SAMPLED_FRAMES)
  expect(gaps.p95).toBeLessThanOrEqual(FRAME_P95_BUDGET_MS)
  expect(gaps.over33).toBeLessThanOrEqual(FRAME_JANK_BUDGET)
}

function expectCalm(watch: CalmWatch): void {
  expect(watch.removed()).toEqual([])
  expect(watch.drifted()).toEqual([])
  expect(watch.narrationGlyphs()).toBeLessThanOrEqual(1)
  expect(watch.shiftedAboveLiveRegion()).toEqual([])
}

async function seedThread(rpc: RpcClient, sessionId: string, exchanges: number): Promise<void> {
  const stream = await openTranscriptStream(rpc, sessionId)
  try {
    for (let index = 0; index < exchanges; index += 1) {
      await sendTurn(rpc, sessionId, `seeded exchange ${index}`)
      await stream.awaitTurnEnd()
    }
  } finally {
    stream.close()
  }
}

async function startHeldToolRun(config: {
  prompt: string
  pending: string
  settled: string
  paceMs?: number
  allow?: Parameters<typeof createCalmWatch>[0]
}): Promise<CalmWatch> {
  await coreControl.holdTools()
  await coreControl.holdResults()
  await coreControl.holdTurn()
  await promptWith(config.prompt)
  await expect.element(stopButton()).toBeVisible()
  const watch = watchCalm(config.allow)
  await watch.checkpoint()
  await coreControl.releaseTools()
  await expect.element(page.getByText(config.pending, {exact: true})).toBeVisible()
  await watch.checkpoint()
  await coreControl.releaseResults(config.paceMs ? {everyMs: config.paceMs} : undefined)
  await expect.element(page.getByText(config.settled, {exact: true})).toBeVisible()
  await watch.checkpoint()
  return watch
}

test('surface immortality and stillness across a multi-tool run [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
  const {sessionId} = await newSession()
  await coreControl.scriptTurn({toolCalls: multiToolSteps(), text: 'All twenty steps are done.'})
  mountChatPane(sessionId)

  const watch = await startHeldToolRun({
    prompt: 'run twenty tools then answer',
    pending: 'probe step 0',
    settled: `step-${MULTI_TOOL_STEPS - 1}.tsx`,
    paceMs: MULTI_TOOL_PACE_MS,
  })
  expectSmooth(watch)
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

  await coreControl.scriptTurn({toolCalls: [{name: 'Read', input: {filePath: 'second.ts'}}], text: 'Second answer.'})
  const watch = await startHeldToolRun({prompt: 'second question', pending: 'second.ts', settled: 'Second answer.'})
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
  const {rpc, sessionId} = await newSession()
  await coreControl.scriptTurn({
    toolCalls: [{name: 'Bash', input: {command: 'rejoin probe'}}],
    text: 'Finished after reload.',
  })
  await coreControl.holdTools()
  await coreControl.holdResults()
  await coreControl.holdTurn()
  await sendTurn(rpc, sessionId, 'a turn started before the reload')

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
  const {rpc, sessionId} = await newSession()
  await seedThread(rpc, sessionId, SEEDED_EXCHANGES)
  await coreControl.scriptTurn({
    toolCalls: [
      {name: 'page.fill', input: {selector: '#name', value: 'Ada'}, result: {ok: true, value: 'Ada'}},
      {name: 'page.click', input: {selector: '#save'}, result: {ok: true}},
    ],
    text: 'The long thread is done.',
  })
  mountChatPane(sessionId)
  await expect.element(page.getByText(`seeded exchange ${SEEDED_EXCHANGES - 1}`, {exact: true})).toBeVisible()
  await expect.element(page.getByText('seeded exchange 0', {exact: true})).toBeInTheDocument()

  const watch = await startHeldToolRun({
    prompt: 'fill and save the form',
    pending: '1 action',
    settled: '2 actions',
    paceMs: BOUNDARY_PACE_MS,
    allow: {allow: ['virtualization']},
  })
  expectSmooth(watch)
  expectCalm(watch)

  await coreControl.releaseTurn()
  await expect.element(page.getByText('The long thread is done.')).toBeVisible()
  await watch.checkpoint()
  await page.screenshot({path: `${SHOTS}/virtualization-boundary.png`})
  expectCalm(watch)
}, 120_000)

test('a thread crossing the virtualization threshold mid-run keeps its visible surfaces [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
  const {rpc, sessionId} = await newSession()
  await seedThread(rpc, sessionId, BOUNDARY_EXCHANGES)
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

test('a streamed code block stays calm and cheap [mechanism D: per-chunk re-tokenisation, render-sync.ts:19-24]', async () => {
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
  const watch = watchCalm()
  await watch.checkpoint({rebaseline: true})

  await coreControl.releaseTools()
  await expect.element(page.getByText(STREAMED_CODE_CLOSING, {exact: true})).toBeVisible()
  await watch.checkpoint()
  expectSmooth(watch)
  await page.screenshot({path: `${SHOTS}/streamed-code-block.png`})
  expectCalm(watch)
}, 120_000)
