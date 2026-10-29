import {render} from '@solidjs/testing-library'
import {expect, it} from 'vitest'
import {page as browserPage} from 'vitest/browser'
import type {JSX} from 'solid-js'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {CodeRunCard, EXECUTE_TOOL_NAME} from '@conciv/core/cards'

const JSON_TREE_ROOT = '[data-scope="json-tree-view"][data-part="root"]'

function mount(child: () => JSX.Element): HTMLElement {
  return render(child).container
}

function runPart(typescriptCode: string): ToolCallPart {
  const input = {typescriptCode}
  return {
    type: 'tool-call',
    id: 'x1',
    name: EXECUTE_TOOL_NAME,
    arguments: JSON.stringify(input),
    input,
    state: 'complete',
  }
}

function runResult(payload: unknown): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'x1', content: JSON.stringify(payload), state: 'complete'}
}

function card(code: string, payload: unknown): () => JSX.Element {
  return () => (
    <CodeRunCard part={runPart(code)} result={runResult(payload)} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />
  )
}

it('an object result opens as a json tree instead of a one-line stringified blob', async () => {
  const container = mount(card('return await report()', {success: true, result: {status: 'ok', pending: 3}}))

  await browserPage.getByRole('button', {name: /return await report/}).click()

  await expect.element(browserPage.getByText('status', {exact: true})).toBeVisible()
  expect(container.querySelectorAll(JSON_TREE_ROOT).length).toBe(1)
  expect(container.textContent).not.toContain('{"status":"ok","pending":3}')
})

it('a string result renders as the string itself, never re-escaped', async () => {
  const container = mount(card('return summary()', {success: true, result: 'the "quoted" bay is clear'}))

  await browserPage.getByRole('button', {name: /return summary/}).click()

  await expect.element(browserPage.getByText('the "quoted" bay is clear')).toBeVisible()
  expect(container.textContent).not.toContain('\\"quoted\\"')
  expect(container.querySelectorAll(JSON_TREE_ROOT).length).toBe(0)
})

it('console logs stay in their own block while the typed result renders structurally', async () => {
  const container = mount(
    card('return await report()', {success: true, logs: ['probing the bay'], result: {status: 'ok'}}),
  )

  await browserPage.getByRole('button', {name: /return await report/}).click()

  await expect.element(browserPage.getByText('status', {exact: true})).toBeVisible()
  await expect.element(browserPage.getByText('console', {exact: true})).toBeVisible()
  expect(container.querySelectorAll(JSON_TREE_ROOT).length).toBe(1)
})
