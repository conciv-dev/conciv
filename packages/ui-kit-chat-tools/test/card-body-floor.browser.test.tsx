import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '@conciv/ui-kit-chat/tools'
import {SearchCard} from '../src/styled/tools/search-card.js'
import {ToolLookupCard} from '../src/styled/tools/tool-lookup-card.js'
import {TodoCard} from '../src/styled/tools/todo-card.js'
import {FileReadCard} from '../src/styled/tools/file-read-card.js'
import {mountView} from './mount-view.js'

function call(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'f1', name, arguments: JSON.stringify(input), input, state}
}

function result(content: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'f1', content, state: 'complete'}
}

async function expandFirst(): Promise<void> {
  await page.getByRole('button').first().click()
}

it('search card names the running state instead of expanding into nothing', async () => {
  mountView(() => (
    <SearchCard
      part={call('Grep', {pattern: 'useChat'}, 'input-complete')}
      result={undefined}
      ctx={INERT_TOOL_CTX}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expandFirst()
  await expect.element(page.getByText('searching…')).toBeVisible()
})

it('search card reports no matches instead of expanding into nothing', async () => {
  mountView(() => (
    <SearchCard
      part={call('Grep', {pattern: 'nothing'})}
      result={result('')}
      ctx={INERT_TOOL_CTX}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expandFirst()
  await expect.element(page.getByText('no matches')).toBeVisible()
})

it('tool lookup card reports a missing query instead of expanding into nothing', async () => {
  mountView(() => (
    <ToolLookupCard
      part={call('ToolSearch', {})}
      result={undefined}
      ctx={INERT_TOOL_CTX}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expandFirst()
  await expect.element(page.getByText('no query')).toBeVisible()
})

it('todo card reports an empty list instead of expanding into nothing', async () => {
  mountView(() => (
    <TodoCard
      part={call('TodoWrite', {todos: []})}
      result={result('{"todos":[]}')}
      ctx={INERT_TOOL_CTX}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expandFirst()
  await expect.element(page.getByText('no to-dos yet')).toBeVisible()
})

it('file read card reports the pending file instead of expanding into nothing', async () => {
  mountView(() => (
    <FileReadCard
      part={call('Read', {}, 'input-streaming')}
      result={undefined}
      ctx={INERT_TOOL_CTX}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expandFirst()
  await expect.element(page.getByText('waiting for the file')).toBeVisible()
})
