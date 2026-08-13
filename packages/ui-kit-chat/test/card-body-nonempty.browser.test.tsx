import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import type {ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {MetaToolCard} from '../src/tools/styled/meta-tool-card.js'
import {ToolFallback} from '../src/tools/styled/tool-fallback.js'
import {INERT_ADD_RESULT, INERT_TOOL_CTX} from '../src/store/tool-context.js'
import {cardPart as part, cardResult, catalogOf, ctxWith} from './card-fixtures.js'
import {mountView} from './mount-view.js'

const NO_SCHEMA_META: ToolViewMeta = {
  summary: 'run a bare tool with no declared inputs',
  mutating: false,
  mirrors: false,
}

const FILL_META: ToolViewMeta = {
  summary: 'type a value into a form field',
  mutating: true,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, value: {type: 'string'}},
    required: ['selector', 'value'],
  },
}

function errorResult(message: string): ToolResultPart {
  return cardResult(JSON.stringify({error: message}), 'error')
}

async function expandFirst(): Promise<void> {
  await page.getByRole('button').first().click()
}

it('MetaToolCard shows a quiet no-input row instead of an empty strip for a zero-input tool', async () => {
  mountView(() => (
    <MetaToolCard
      part={part('page.noop', {})}
      result={undefined}
      ctx={ctxWith(catalogOf({'page.noop': NO_SCHEMA_META}))}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expandFirst()
  await expect.element(page.getByText('no input')).toBeVisible()
})

it('MetaToolCard shows its input chips while running with no result yet', async () => {
  mountView(() => (
    <MetaToolCard
      part={part('page.fill', {selector: '#name', value: 'Ada'}, 'input-complete')}
      result={undefined}
      ctx={ctxWith(catalogOf({'page.fill': FILL_META}))}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expandFirst()
  await expect.element(page.getByText('Ada')).toBeVisible()
})

it('MetaToolCard shows the error block alongside its input chips for an error-only result', async () => {
  mountView(() => (
    <MetaToolCard
      part={part('page.fill', {selector: '#name', value: 'Ada'})}
      result={errorResult('element not found')}
      ctx={ctxWith(catalogOf({'page.fill': FILL_META}))}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expandFirst()
  await expect.element(page.getByText('Ada')).toBeVisible()
  await expect.element(page.getByText('element not found')).toBeVisible()
})

it('ToolFallback shows the raw args block for a zero-argument call', async () => {
  mountView(() => (
    <ToolFallback
      part={{type: 'tool-call', id: 'z1', name: 'ping', arguments: '', state: 'complete'}}
      result={undefined}
      ctx={INERT_TOOL_CTX}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expect.element(page.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button').click()
  await expect.element(page.getByText(/\{\}/).first()).toBeVisible()
})
