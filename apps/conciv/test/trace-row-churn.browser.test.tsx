import '../src/styles.css'
import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {ChatPane} from '../src/pane/chat-pane.js'
import {bootedCore} from './helpers/booted-core.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {mountPane, type PaneMount} from './helpers/pane-harness.js'

const ROWS = 150
const REDUNDANT_WRITE_BUDGET = ROWS * 3

const coreBase = bootedCore('trace-row-churn')
const active: {pane: PaneMount | null} = {pane: null}

afterEach(async () => {
  await coreControl.releaseTools()
  await coreControl.releaseResults()
  await coreControl.releaseTurn()
  active.pane?.dispose()
  active.pane = null
})

async function newSession(): Promise<string> {
  return createSession(coreRpc(coreBase()))
}

function redundantClassWrites(records: readonly MutationRecord[]): number {
  return records.filter((record) => {
    if (record.type !== 'attributes' || record.attributeName !== 'class') return false
    if (!(record.target instanceof Element)) return false
    return record.target.getAttribute('class') === record.oldValue
  }).length
}

async function streamToolCalls(steps: number): Promise<number> {
  const sessionId = await newSession()
  await coreControl.scriptTurn({
    toolCalls: Array.from({length: steps}, (_, index) => ({name: 'Read', input: {filePath: `step-${index}.ts`}})),
    text: 'Every step is done.',
  })
  await coreControl.holdResults()
  active.pane = mountPane({base: coreBase(), sessionId}, () => <ChatPane sessionId={sessionId} />)

  const box = page.getByRole('textbox', {name: 'Message the conciv agent'})
  await expect.element(box).toBeVisible()
  await box.fill('run every step')
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByText('step-0.ts', {exact: true})).toBeVisible()

  const records: MutationRecord[] = []
  const observer = new MutationObserver((list) => records.push(...list))
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
  })
  await coreControl.releaseResults({everyMs: 40})
  await expect.element(page.getByText('Every step is done.')).toBeVisible()
  await expect.element(page.getByText(`step-${steps - 1}.ts`, {exact: true})).toBeVisible()
  for (const record of observer.takeRecords()) records.push(record)
  observer.disconnect()
  return redundantClassWrites(records)
}

test('streaming tool results rewrites no settled row', async () => {
  expect(await streamToolCalls(ROWS)).toBeLessThanOrEqual(REDUNDANT_WRITE_BUDGET)
}, 120_000)
