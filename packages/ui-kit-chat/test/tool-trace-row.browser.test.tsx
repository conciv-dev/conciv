import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ToolTraceRow} from '../src/tools/styled/tool-call-card.js'
import {TraceOutputBlock} from '../src/styled/trace/output-block.js'
import {mountView} from './mount-view.js'

function ctxRecording(decisions: Array<{id: string; approved: boolean}>): ToolViewCtx {
  return {
    apiBase: '',
    harnessId: 'test',
    sendMessage: () => {},
    catalog: {loaded: () => true, meta: () => undefined},
    addResult: () => {},
    respondApproval: (id, approved) => decisions.push({id, approved}),
  }
}

const noCtx = ctxRecording([])

function call(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'c1', name, arguments: JSON.stringify(input), input, state}
}

it('falls back to a generic projection for a tool that supplies no row', async () => {
  mountView(() => (
    <ToolTraceRow
      part={call('mcp__weather__forecast', {location: 'Tel Aviv'})}
      result={undefined}
      ctx={noCtx}
      tools={() => []}
    />
  ))

  await expect.element(page.getByRole('img', {name: 'succeeded'})).toBeVisible()
  await expect.element(page.getByText('forecast')).toBeVisible()
  await expect.element(page.getByText('Tel Aviv', {exact: true})).toBeVisible()
})

function forecastResult(): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'c1', content: 'clear skies over the bay', state: 'complete'}
}

it('mounts the generic tool body under the row as a JSON tree plus shiki result, with no extra click', async () => {
  const container = mountView(() => (
    <ToolTraceRow
      part={call('mcp__weather__forecast', {location: 'Tel Aviv'})}
      result={forecastResult()}
      ctx={noCtx}
      tools={() => []}
    />
  ))

  await expect.element(page.getByText('clear skies over the bay')).toBeVisible()
  await expect.element(page.getByText('location', {exact: true})).toBeVisible()
  expect(container.querySelectorAll('diffs-container').length).toBe(1)
  await page.screenshot({path: '__screenshots__/tool-trace-row/generic-body-shiki.png'})
})

it('folds a mounted body away and back from the row control', async () => {
  mountView(() => (
    <ToolTraceRow
      part={call('mcp__weather__forecast', {location: 'Tel Aviv'})}
      result={forecastResult()}
      ctx={noCtx}
      tools={() => []}
    />
  ))

  const fold = page.getByRole('button', {name: /Tel Aviv/})
  await expect.element(fold).toHaveAttribute('aria-expanded', 'true')

  await fold.click()

  await expect.element(fold).toHaveAttribute('aria-expanded', 'false')

  await fold.click()

  await expect.element(fold).toHaveAttribute('aria-expanded', 'true')
})

const LONG_OUTPUT = Array.from({length: 35}, (_, index) => `src/file-${index}.ts:${index}: a matching line`).join('\n')

function bashCall(): ToolCallPart {
  return {type: 'tool-call', id: 'c1', name: 'Bash', arguments: '{"command":"grep -rn match src"}', state: 'complete'}
}

function outputTool(text: string): ToolCardEntry {
  return {
    names: ['Bash'],
    render: () => <TraceOutputBlock text={text}>{text}</TraceOutputBlock>,
    hasEmbeddedBody: () => true,
  }
}

const longOutputTool = outputTool(LONG_OUTPUT)
const shortOutputTool = outputTool('one\ntwo')

function revealControl(container: HTMLElement): HTMLElement {
  const match = [...container.querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes('more lines'),
  )
  if (!match) throw new Error('expected a clamp reveal control')
  return match
}

it('clamps a long body and reveals the rest from the frame footer', async () => {
  const container = mountView(() => (
    <ToolTraceRow part={bashCall()} result={undefined} ctx={noCtx} tools={() => [longOutputTool]} />
  ))

  await expect.element(page.getByText('src/file-0.ts:0: a matching line'), {timeout: 3000}).toBeVisible()

  const control = revealControl(container)
  expect(control.getAttribute('aria-expanded')).toBe('false')
  expect(control.textContent).toContain('24 more lines')

  await userEvent.click(control)
  await expect.element(page.getByText('src/file-34.ts:34: a matching line'), {timeout: 3000}).toBeVisible()

  expect(control.getAttribute('aria-expanded')).toBe('true')
  expect(control.textContent).toBe('show less')

  await userEvent.click(control)
  await expect.element(page.getByText('src/file-0.ts:0: a matching line'), {timeout: 3000}).toBeVisible()

  expect(control.getAttribute('aria-expanded')).toBe('false')
})

it('leaves a body that already fits without any clamp footer', async () => {
  const container = mountView(() => (
    <ToolTraceRow part={bashCall()} result={undefined} ctx={noCtx} tools={() => [shortOutputTool]} />
  ))

  await expect.element(page.getByText('one'), {timeout: 3000}).toBeVisible()
  expect([...container.querySelectorAll('button')].map((button) => button.textContent ?? '')).not.toContain(
    expect.stringContaining('more lines'),
  )
})

const silentTool: ToolCardEntry = {
  names: ['Bash'],
  render: () => null,
  hasEmbeddedBody: () => false,
}

it('leaves the row inert when the card declares it renders no embedded body', async () => {
  mountView(() => <ToolTraceRow part={bashCall()} result={undefined} ctx={noCtx} tools={() => [silentTool]} />)

  await expect.element(page.getByText('grep -rn match src')).toBeVisible()
  await expect.element(page.getByRole('button')).toBeDisabled()
})

const speakingTool: ToolCardEntry = {
  names: ['ping'],
  render: () => <TraceOutputBlock text="pong">pong</TraceOutputBlock>,
  hasEmbeddedBody: () => true,
}

it('mounts the body a card declares even when the call carries no arguments and no result', async () => {
  mountView(() => <ToolTraceRow part={call('ping', {})} result={undefined} ctx={noCtx} tools={() => [speakingTool]} />)

  await expect.element(page.getByText('pong')).toBeVisible()
})

it('leaves a row with nothing to show inert rather than offering an empty fold', async () => {
  mountView(() => <ToolTraceRow part={call('ping', {})} result={undefined} ctx={noCtx} tools={() => []} />)

  await expect.element(page.getByText('ping').first()).toBeVisible()
  await expect.element(page.getByRole('button')).toBeDisabled()
})

it('routes a call waiting on approval to the permission block', async () => {
  const decisions: Array<{id: string; approved: boolean}> = []
  const asking: ToolCallPart = {
    ...call('Bash', {command: 'rm -rf dist'}, 'approval-requested'),
    approval: {id: 'ap-1', needsApproval: true},
  }
  mountView(() => <ToolTraceRow part={asking} result={undefined} ctx={ctxRecording(decisions)} tools={() => []} />)

  await expect.element(page.getByRole('group', {name: 'Permission request'})).toBeVisible()

  await page.getByRole('button', {name: 'Approve'}).click()

  await expect.element(page.getByText('Approved', {exact: true})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Approve'})).not.toBeInTheDocument()
  expect(decisions).toEqual([{id: 'ap-1', approved: true}])
})
