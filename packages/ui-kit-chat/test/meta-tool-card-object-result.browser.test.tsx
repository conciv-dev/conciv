import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {MetaToolCard} from '../src/tools/styled/meta-tool-card.js'
import {INERT_ADD_RESULT} from '../src/store/tool-context.js'
import {cardPart as part, cardResult, catalogOf, ctxWith} from './card-fixtures.js'
import {mountView} from './mount-view.js'

const JSON_TREE_ROOT = '[data-scope="json-tree-view"][data-part="root"]'

const measureMeta: ToolViewMeta = {
  summary: 'measure an element on the page',
  category: 'read',
  icon: 'pointer',
  label: {running: 'Measuring the element', done: 'Measured the element'},
  positional: 'selector',
  mutating: false,
  mirrors: false,
  inputSchema: {type: 'object', properties: {selector: {type: 'string'}}, required: ['selector']},
  outputSchema: {type: 'object', properties: {width: {type: 'number'}, height: {type: 'number'}}},
}

it('an object-shaped result opens as a json tree instead of a raw text block', async () => {
  const container = mountView(() => (
    <MetaToolCard
      part={part('page.measure', {selector: '#hero'})}
      result={cardResult('{"width":320,"height":48}', 'complete')}
      ctx={ctxWith(catalogOf({'page.measure': measureMeta}))}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await userEvent.click(page.getByRole('button'))

  await expect.element(page.getByText('width', {exact: true})).toBeVisible()
  expect(container.querySelectorAll(JSON_TREE_ROOT).length).toBe(1)
  expect(container.textContent).not.toContain('{"width":320,"height":48}')
})
