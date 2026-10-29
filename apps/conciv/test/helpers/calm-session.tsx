import {afterAll, afterEach, beforeAll, expect} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {RpcClient} from '@conciv/contract'
import {VIRTUALIZE_THRESHOLD} from '@conciv/ui-kit-chat'
import {ChatPane} from '../../src/pane/chat-pane.js'
import {coreControl} from './core-control.js'
import {coreRpc, createSession, runTurn} from './core-session.js'
import {mountPane, type PaneMount} from './pane-harness.js'
import {createCalmWatch, type CalmWatch} from './calm-assertions.js'

const MULTI_TOOL_STEPS = 20
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
export const STREAMED_TEXT_CHUNK = 56
export const STREAMED_TEXT_PACE_MS = 30
export const STREAMED_CODE_CLOSING = 'That is the whole helper.'
const SEEDED_EXCHANGES = Math.floor((VIRTUALIZE_THRESHOLD - 4) / 2)

export const core = {base: ''}
const active: {pane: PaneMount | null; watch: CalmWatch | null} = {pane: null, watch: null}

export function registerCalmCore(id: string): void {
  beforeAll(async () => {
    const booted = await coreControl.bootCore({id, allowedOrigins: [window.location.origin]})
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
    await coreControl.clearScript()
    active.pane?.dispose()
    active.pane = null
  })
}

export async function newSession(): Promise<{rpc: RpcClient; sessionId: string}> {
  const rpc = coreRpc(core.base)
  return {rpc, sessionId: await createSession(rpc)}
}

export function mountChatPane(sessionId: string): PaneMount {
  const mount = mountPane({base: core.base, sessionId}, () => <ChatPane sessionId={sessionId} />)
  active.pane = mount
  return mount
}

export function watchCalm(allow: Parameters<typeof createCalmWatch>[0] = {}): CalmWatch {
  const watch = createCalmWatch(allow)
  active.watch = watch
  return watch
}

export const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
export const stopButton = () => page.getByRole('button', {name: 'Stop generating'})

export async function promptWith(text: string): Promise<void> {
  await expect.element(input()).toBeVisible()
  await input().fill(text)
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByText(text)).toBeVisible()
}

export type ScriptedToolStep = {name: string; input: Record<string, string>}

function editStep(index: number): ScriptedToolStep {
  return {name: 'Edit', input: {file_path: `step-${index}.tsx`, old_string: DIFF_BEFORE, new_string: DIFF_AFTER}}
}

export function multiToolStep(index: number): ScriptedToolStep {
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

export function streamedCodeAnswer(): string {
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

export async function seedThread(base: string, sessionId: string, exchanges: number): Promise<void> {
  for (let index = 0; index < exchanges; index += 1) {
    await runTurn(base, sessionId, `seeded exchange ${index}`)
  }
}

export async function startHeldToolRun(config: {
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

export async function startMultiToolRun(): Promise<CalmWatch> {
  const {sessionId} = await newSession()
  await coreControl.scriptTurn({toolCalls: multiToolSteps(), text: 'All twenty steps are done.'})
  mountChatPane(sessionId)
  return startHeldToolRun({
    prompt: 'run twenty tools then answer',
    pending: 'probe step 0',
    settled: `step-${MULTI_TOOL_STEPS - 1}.tsx`,
    paceMs: MULTI_TOOL_PACE_MS,
  })
}

export async function startBoundaryRun(): Promise<CalmWatch> {
  const {sessionId} = await newSession()
  await seedThread(core.base, sessionId, SEEDED_EXCHANGES)
  await coreControl.scriptTurn({
    toolCalls: [
      {name: 'page_fill', input: {selector: '#name', value: 'Ada'}, result: {ok: true, value: 'Ada'}},
      {name: 'page_click', input: {selector: '#save'}, result: {ok: true}},
    ],
    text: 'The long thread is done.',
  })
  mountChatPane(sessionId)
  await expect.element(page.getByText(`seeded exchange ${SEEDED_EXCHANGES - 1}`, {exact: true})).toBeVisible()
  await expect.element(page.getByText('seeded exchange 0', {exact: true})).toBeInTheDocument()
  return startHeldToolRun({
    prompt: 'fill and save the form',
    pending: '1 action',
    settled: '2 actions',
    paceMs: BOUNDARY_PACE_MS,
    allow: {allow: ['virtualization']},
  })
}

export async function streamCodeAnswer(): Promise<CalmWatch> {
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
  return watch
}
