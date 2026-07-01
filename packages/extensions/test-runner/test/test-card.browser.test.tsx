import {describe, it, expect, afterEach} from 'vitest'
import {render} from 'solid-js/web'
import {page} from 'vitest/browser'
import type {ToolViewCtx, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {TestCard} from '../src/tool/card.js'

// Real browser, real Solid (card source compiled on the fly), real Ark Collapsible + a real
// EventSource against the same-origin SSE fixture. No jsdom, no mocks of the card's transports.

const FILE = '/proj/app/math.test.ts'
const RESULT = {
  summary: {passed: 1, failed: 1, skipped: 0, durationMs: 5},
  failures: [{file: FILE, name: 'adds', message: 'expected 2 to be 3', stack: 'expected 2 to be 3', line: 4}],
  tests: [
    {file: FILE, name: 'subtracts', state: 'pass', durationMs: 1},
    {
      file: FILE,
      name: 'adds',
      state: 'fail',
      durationMs: 1,
      error: {file: FILE, name: 'adds', message: 'expected 2 to be 3', stack: 'expected 2 to be 3', line: 4},
    },
  ],
}

const disposers: (() => void)[] = []

function mountCard(over: Partial<ToolCardProps>, ctx: ToolViewCtx): void {
  const host = document.createElement('div')
  document.body.appendChild(host)
  disposers.push(
    render(
      () => (
        <TestCard
          part={{type: 'tool-call', id: 't1', name: 'test_runner', arguments: '{}', state: 'input-complete'}}
          result={undefined}
          ctx={ctx}
          {...over}
        />
      ),
      host,
    ),
  )
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

describe('TestCard (real browser)', () => {
  it('renders the pass/fail tree and expands a failure row to Fix this + Open file:line', async () => {
    const sent: string[] = []
    const ctx: ToolViewCtx = {apiBase: '', harnessId: 'claude', sendMessage: (text) => sent.push(text)}
    mountCard(
      {result: {type: 'tool-result', toolCallId: 't1', content: JSON.stringify(RESULT), state: 'complete'}},
      ctx,
    )

    await expect.element(page.getByText('subtracts')).toBeVisible()
    await expect.element(page.getByText('1 passed')).toBeVisible()
    await expect.element(page.getByText('1 failed')).toBeVisible()

    await page.getByRole('button', {name: /adds/}).click()
    await expect.element(page.getByRole('button', {name: 'Fix this'})).toBeVisible()
    await expect.element(page.getByRole('button', {name: /Open app\/math\.test\.ts:4/})).toBeVisible()

    await page.getByRole('button', {name: 'Fix this'}).click()
    expect(sent[0]).toContain('adds')
  })

  it('opens a real EventSource and builds the tree live when result is null', async () => {
    const ctx: ToolViewCtx = {apiBase: '', harnessId: 'claude', sendMessage: () => {}}
    mountCard({result: undefined}, ctx)

    await expect.element(page.getByText('works')).toBeVisible()
    await expect.element(page.getByText('broken')).toBeVisible()
    await expect.element(page.getByText('1 passed')).toBeVisible()
    await expect.element(page.getByText('1 failed')).toBeVisible()
  })
})
