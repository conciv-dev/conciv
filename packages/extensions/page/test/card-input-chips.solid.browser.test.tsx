import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {ReactCard} from '../src/client/cards/react-card.js'
import {ReadBulkCard} from '../src/client/cards/read-bulk-card.js'
import {ReadValueCard} from '../src/client/cards/read-value-card.js'
import {storyAddResult, storyCtx, storyPart, storyResult} from '../src/client/cards/story.fixtures.js'

const READ_VALUE_META: ToolViewMeta = {
  summary: 'read the visible text of an element',
  category: 'read',
  mutating: false,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, trim: {type: 'boolean'}},
    required: ['selector'],
  },
}

const READ_BULK_META: ToolViewMeta = {
  summary: 'read the markup of an element',
  category: 'read',
  mutating: false,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, maxChars: {type: 'number'}},
    required: ['selector'],
  },
}

const REACT_META: ToolViewMeta = {
  summary: 'locate the react source of an element',
  category: 'read',
  mutating: false,
  mirrors: false,
  inputSchema: {
    type: 'object',
    properties: {selector: {type: 'string'}, action: {type: 'string'}},
    required: ['selector'],
  },
}

async function expandCard(): Promise<void> {
  await page.getByRole('button').first().click()
}

function chipNames(): Array<string> {
  return page
    .getByRole('term')
    .elements()
    .map((element) => element.textContent ?? '')
}

it('read-value card leads its input row with the element chip and drops the raw selector key', async () => {
  render(() => (
    <ReadValueCard
      part={storyPart('page.text', {selector: '#headline', trim: true})}
      result={storyResult({text: 'Ship it on Friday'})}
      ctx={storyCtx({'page.text': READ_VALUE_META})}
      addResult={storyAddResult}
    />
  ))

  await expandCard()
  await expect.element(page.getByText('#headline')).toBeVisible()

  expect(chipNames()[0]).toBe('element')
  expect(chipNames()).toContain('trim')
  expect(chipNames()).not.toContain('selector')
})

it('read-bulk card leads its input row with the element chip and keeps the declared detail chip', async () => {
  render(() => (
    <ReadBulkCard
      part={storyPart('page.html', {selector: 'form', maxChars: 2000})}
      result={storyResult({html: '<form></form>'})}
      ctx={storyCtx({'page.html': READ_BULK_META})}
      addResult={storyAddResult}
    />
  ))

  await expandCard()
  await expect.element(page.getByText('form').first()).toBeVisible()

  expect(chipNames()[0]).toBe('element')
  expect(chipNames()).toContain('maxChars')
  expect(chipNames()).not.toContain('selector')
})

it('react card leads its input row with the element chip and keeps the declared detail chip', async () => {
  render(() => (
    <ReactCard
      part={storyPart('page.react', {selector: '#checkout', action: 'source'})}
      result={storyResult({component: 'CheckoutForm'})}
      ctx={storyCtx({'page.react': REACT_META})}
      addResult={storyAddResult}
    />
  ))

  await expandCard()
  await expect.element(page.getByText('#checkout')).toBeVisible()

  expect(chipNames()[0]).toBe('element')
  expect(chipNames()).toContain('action')
  expect(chipNames()).not.toContain('selector')
})
