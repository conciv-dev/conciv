import {describe, it, expect, afterEach} from 'vitest'
import {render} from 'solid-js/web'
import {page} from 'vitest/browser'
import type {ToolCatalogView, ToolViewCtx, ToolCardProps, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {HostApiProvider} from '@conciv/extension'
import {TestCard} from '../src/tool/card.js'

const FILE = '/proj/app/math.test.ts'
const STACK = 'at add (app/math.ts:12:9)\nat app/math.test.ts:4:3'
const FAILURE = {file: FILE, name: 'adds', message: 'expected 2 to be 3', stack: STACK, line: 4}
const RESULT = {
  summary: {passed: 1, failed: 1, skipped: 0, durationMs: 5},
  failures: [FAILURE],
  tests: [
    {file: FILE, name: 'subtracts', state: 'pass', durationMs: 1},
    {file: FILE, name: 'adds', state: 'fail', durationMs: 1, error: FAILURE},
  ],
}

const TOOL_META: ToolViewMeta = {
  summary: 'drive the live test runner',
  icon: 'script',
  label: {running: 'Running the tests', done: 'Ran the tests'},
  mutating: false,
  mirrors: false,
}

const catalog: ToolCatalogView = {
  loaded: () => true,
  meta: (name) => (name === 'test_runner' ? TOOL_META : undefined),
}

function makeCtx(sent: string[]): ToolViewCtx {
  return {
    apiBase: '',
    harnessId: 'claude',
    sendMessage: (text) => sent.push(text),
    addResult: () => {},
    catalog,
  }
}

const disposers: (() => void)[] = []

function mountCard(over: Partial<ToolCardProps>, ctx: ToolViewCtx, onOpenEditor?: (file: string) => void): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  disposers.push(
    render(
      () => (
        <HostApiProvider openEditor={(file) => onOpenEditor?.(file)}>
          <TestCard
            part={{type: 'tool-call', id: 't1', name: 'test_runner', arguments: '{}', state: 'input-complete'}}
            result={undefined}
            ctx={ctx}
            addResult={() => {}}
            {...over}
          />
        </HostApiProvider>
      ),
      host,
    ),
  )
}

function completedRun(): Partial<ToolCardProps> {
  return {result: {type: 'tool-result', toolCallId: 't1', content: JSON.stringify(RESULT), state: 'complete'}}
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

describe('TestCard (real browser)', () => {
  it('titles the card from the catalog label and lists every test row', async () => {
    mountCard(completedRun(), makeCtx([]))

    await expect.element(page.getByText('Ran the tests')).toBeVisible()
    await expect.element(page.getByText('1 passed', {exact: true})).toBeVisible()
    await expect.element(page.getByText('1 failed', {exact: true})).toBeVisible()
    await expect.element(page.getByText('subtracts')).toBeVisible()
  })

  it('announces the run summary in a live region', async () => {
    mountCard(completedRun(), makeCtx([]))

    await expect.element(page.getByRole('status')).toHaveTextContent('1 passed, 1 failed')
  })

  it('expands a failure into its message, stack and the open/fix actions', async () => {
    const sent: string[] = []
    mountCard(completedRun(), makeCtx(sent))

    await page.getByRole('button', {name: /adds/}).click()
    await expect.element(page.getByText('app/math.test.ts:4', {exact: true})).toBeVisible()
    await expect.element(page.getByText('expected 2 to be 3', {exact: true})).toBeVisible()

    await expect.element(page.getByRole('button', {name: /Open app\/math\.test\.ts:4/})).toBeVisible()
    await page.getByRole('button', {name: 'Fix this'}).click()
    expect(sent[0]).toContain('adds')
  })

  it('collapses a file section to hide its test rows', async () => {
    mountCard(completedRun(), makeCtx([]))

    await expect.element(page.getByText('subtracts')).toBeVisible()
    await page.getByRole('button', {name: /app\/math\.test\.ts/}).click()
    await expect.element(page.getByText('subtracts')).not.toBeVisible()
  })

  it('opens a real stream and builds the tree live when result is null', async () => {
    mountCard({result: undefined}, makeCtx([]))

    await expect.element(page.getByText('works')).toBeVisible()
    await expect.element(page.getByText('broken')).toBeVisible()
    await expect.element(page.getByText('1 passed', {exact: true})).toBeVisible()
    await expect.element(page.getByText('1 failed', {exact: true})).toBeVisible()
  })
})
