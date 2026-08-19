import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '../src/store/tool-context.js'
import {ToolFallback} from '../src/tools/styled/tool-fallback.js'
import {mountView} from './mount-view.js'

const ctx = {...INERT_TOOL_CTX, respondApproval: () => {}}

function part(args: Record<string, unknown>): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'f1',
    name: 'mcp__weather__forecast',
    arguments: JSON.stringify(args),
    state: 'complete',
  }
}

function result(content: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'f1', content, state: 'complete'}
}

async function openBody(): Promise<void> {
  await userEvent.click(page.getByRole('button'))
}

it('renders an object payload as an expandable JSON tree, not a shiki code block', async () => {
  const container = mountView(() => (
    <ToolFallback part={part({city: 'Berlin'})} result={undefined} ctx={ctx} addResult={INERT_ADD_RESULT} />
  ))

  await openBody()

  await expect.element(page.getByText('city', {exact: true})).toBeVisible()
  expect(container.querySelectorAll('[data-scope="json-tree-view"][data-part="root"]').length).toBe(1)
  expect(container.querySelectorAll('diffs-container').length).toBe(0)
})

it('renders a plain-text result as a shiki code block, not a JSON tree', async () => {
  const container = mountView(() => (
    <ToolFallback part={part({})} result={result('clear skies over the bay')} ctx={ctx} addResult={INERT_ADD_RESULT} />
  ))

  await openBody()

  await expect.element(page.getByText('clear skies over the bay')).toBeVisible()
  expect(container.querySelectorAll('diffs-container').length).toBe(1)
  expect(container.querySelectorAll('[data-scope="json-tree-view"][data-part="root"]').length).toBe(0)
})
