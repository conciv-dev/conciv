import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import type {ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {ActCard} from '../src/client/cards/act-card.js'
import {storyAddResult, storyCtx, storyPart} from '../src/client/cards/story.fixtures.js'

function errorResult(toolCallId: string, message: string): ToolResultPart {
  return {type: 'tool-result', toolCallId, content: JSON.stringify({message}), state: 'error', error: message}
}

const NO_SCHEMA_META: ToolViewMeta = {
  summary: 'run a synthetic effect with no declared inputs',
  category: 'act',
  mutating: true,
  mirrors: false,
}

const FILL_META: ToolViewMeta = {
  summary: 'type a value into a form field',
  category: 'act',
  mutating: true,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, value: {type: 'string'}},
    required: ['value'],
  },
}

async function expandFirstCard(): Promise<void> {
  await page.getByRole('button').first().click()
}

it('shows a quiet no-input row instead of an empty strip for a zero-input act call', async () => {
  render(() => (
    <ActCard
      part={storyPart('page_effect', {})}
      result={undefined}
      ctx={storyCtx({page_effect: NO_SCHEMA_META})}
      addResult={storyAddResult}
    />
  ))

  await expandFirstCard()
  await expect.element(page.getByText('no input')).toBeVisible()
})

it('shows its input chips while running with no result yet', async () => {
  render(() => (
    <ActCard
      part={storyPart('page_fill', {selector: '#email', value: 'ada@example.com'}, 'input-complete')}
      result={undefined}
      ctx={storyCtx({page_fill: FILL_META})}
      addResult={storyAddResult}
    />
  ))

  await expandFirstCard()
  await expect.element(page.getByText('ada@example.com')).toBeVisible()
  await expect.element(page.getByText('#email')).toBeVisible()
})

it('shows the error block alongside its input chips for an error-only result', async () => {
  render(() => (
    <ActCard
      part={storyPart('page_fill', {selector: '#email', value: 'ada@example.com'})}
      result={errorResult('s1', 'element not found')}
      ctx={storyCtx({page_fill: FILL_META})}
      addResult={storyAddResult}
    />
  ))

  await expandFirstCard()
  await expect.element(page.getByText('ada@example.com')).toBeVisible()
  await expect.element(page.getByText('element not found')).toBeVisible()
})
