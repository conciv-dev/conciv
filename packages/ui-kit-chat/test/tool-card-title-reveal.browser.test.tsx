import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import type {ToolCallPart} from '@tanstack/ai-client'
import {ToolCard} from '../src/tools/styled/tool-card.js'
import {mountView} from './mount-view.js'

const LONG_TITLE = 'Filled the field #email on the long profile form that keeps going well past the card'
const SUMMARY = 'type a value into a form field'

function part(): ToolCallPart {
  return {type: 'tool-call', id: 't1', name: 'demo', arguments: '{}', input: {}, state: 'complete'}
}

function titleIn(host: Element, text: string): HTMLElement {
  for (const node of host.querySelectorAll('[data-scope="tooltip"][data-part="trigger"], span')) {
    if (node instanceof HTMLElement && node.textContent === text) return node
  }
  throw new Error(`no headline reads "${text}"`)
}

it('lets the card summary own the hover when the card carries one', async () => {
  const host = mountView(() => (
    <div class="w-70">
      <ToolCard title={LONG_TITLE} titleTooltip={SUMMARY} part={part()} result={undefined}>
        <span>step rail</span>
      </ToolCard>
    </div>
  ))

  await page.elementLocator(titleIn(host, LONG_TITLE)).hover()

  await expect.element(page.getByRole('tooltip')).toHaveTextContent(SUMMARY)
})

it('reveals a clipped card title when no summary claims the hover', async () => {
  const host = mountView(() => (
    <div class="w-70">
      <ToolCard title={LONG_TITLE} part={part()} result={undefined}>
        <span>step rail</span>
      </ToolCard>
    </div>
  ))

  await page.elementLocator(titleIn(host, LONG_TITLE)).hover()

  await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG_TITLE)
})
