import 'virtual:uno.css'
import {afterEach, expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {MetaToolCard} from '../src/styled/tools/meta-tool-card.js'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '../src/store/tool-context.js'
import {cleanupViews, mountView} from './mount-view.js'

afterEach(() => {
  cleanupViews()
})

const fillMeta: ToolViewMeta = {
  summary: 'type a value into a form field',
  category: 'act',
  icon: 'keyboard',
  label: {running: 'Filling the field', done: 'Filled the field'},
  positional: 'selector',
  mutating: true,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, value: {type: 'string'}},
    required: ['selector', 'value'],
  },
  outputSchema: {type: 'object', properties: {ok: {type: 'boolean'}}},
  errors: [{code: 'NO_MATCH', message: 'nothing on the page matches that selector'}],
}

function catalogOf(entries: Record<string, ToolViewMeta>): ToolCatalogView {
  return {loaded: () => true, meta: (name) => entries[name]}
}

function ctxWith(catalog: ToolCatalogView): ToolViewCtx {
  return {...INERT_TOOL_CTX, catalog}
}

function part(name: string, input: Record<string, unknown>): ToolCallPart {
  return {type: 'tool-call', id: 'e1', name, arguments: JSON.stringify(input), input, state: 'complete'}
}

function errorResult(content: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'e1', content, state: 'error'}
}

it('a structured payload whose code matches a declared error renders the declared message', async () => {
  mountView(() => (
    <MetaToolCard
      part={part('page.fill', {selector: '#ghost', value: 'nobody'})}
      result={errorResult('{"error":{"message":"page.fill failed","code":"NO_MATCH"}}')}
      ctx={ctxWith(catalogOf({'page.fill': fillMeta}))}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await userEvent.click(page.getByRole('button'))
  await expect.element(page.getByText('nothing on the page matches that selector')).toBeVisible()
  expect(document.body.textContent).not.toContain('page.fill failed')
})

it('a structured payload with an unknown code falls through to the payload message', async () => {
  mountView(() => (
    <MetaToolCard
      part={part('page.fill', {selector: '#ghost', value: 'nobody'})}
      result={errorResult('{"error":{"message":"the sandbox blew up","code":"SOMETHING_ELSE"}}')}
      ctx={ctxWith(catalogOf({'page.fill': fillMeta}))}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await userEvent.click(page.getByRole('button'))
  await expect.element(page.getByText('the sandbox blew up', {exact: true})).toBeVisible()
  expect(document.body.textContent).not.toContain('nothing on the page matches that selector')
})

it('a non-JSON result body that merely looks like a declared-error prefix falls through to the raw text', async () => {
  mountView(() => (
    <MetaToolCard
      part={part('page.fill', {selector: '#ghost', value: 'nobody'})}
      result={errorResult('NO_MATCH: the field vanished')}
      ctx={ctxWith(catalogOf({'page.fill': fillMeta}))}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await userEvent.click(page.getByRole('button'))
  await expect.element(page.getByText('NO_MATCH: the field vanished', {exact: true})).toBeVisible()
  expect(document.body.textContent).not.toContain('nothing on the page matches that selector')
})
