import 'virtual:uno.css'
import {page} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {PageActionCard} from '../src/styled/page-action-card.js'
import {cleanupViews, mountView} from './mount-view.js'

afterEach(() => {
  cleanupViews()
})

const ctx: ToolViewCtx = {apiBase: '', harnessId: 'test', sendMessage: () => {}}

function part(args: Record<string, unknown>): ToolCallPart {
  return {type: 'tool-call', id: 'p1', name: 'conciv_page', arguments: JSON.stringify(args), state: 'complete'}
}

it('titles a click with the declared label', async () => {
  mountView(() => <PageActionCard part={part({verb: 'click', selector: '#submit'})} result={undefined} ctx={ctx} />)

  await expect.element(page.getByText('Clicked')).toBeVisible()
})

it('titles a fill with the declared label and the typed value', async () => {
  mountView(() => (
    <PageActionCard
      part={part({verb: 'fill', selector: '#email', value: 'jane@example.com'})}
      result={undefined}
      ctx={ctx}
    />
  ))

  await expect.element(page.getByText('Typed "jane@example.com"')).toBeVisible()
})

it('titles a tree read verb', async () => {
  mountView(() => <PageActionCard part={part({verb: 'tree'})} result={undefined} ctx={ctx} />)

  await expect.element(page.getByText('Read the page tree')).toBeVisible()
})

it('titles a press with the declared label and the pressed key', async () => {
  mountView(() => <PageActionCard part={part({verb: 'press', key: 'Enter'})} result={undefined} ctx={ctx} />)

  await expect.element(page.getByText('Pressed Enter')).toBeVisible()
})

it('falls back to a generic title when the verb is missing', async () => {
  mountView(() => <PageActionCard part={part({})} result={undefined} ctx={ctx} />)

  await expect.element(page.getByText('Page action')).toBeVisible()
})
