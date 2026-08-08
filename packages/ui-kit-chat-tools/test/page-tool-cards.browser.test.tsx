import 'virtual:uno.css'
import {page} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {MetaToolCard} from '@conciv/ui-kit-chat'
import {cleanupViews, mountView} from './mount-view.js'
import {builtinPageRegistry, registryCatalogView} from './registry-catalog-view.js'

afterEach(() => {
  cleanupViews()
})

const ctx: ToolViewCtx = {
  apiBase: '',
  harnessId: 'test',
  sendMessage: () => {},
  catalog: registryCatalogView(builtinPageRegistry()),
}

function part(verb: string, input: Record<string, unknown>): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'p1',
    name: `page.${verb}`,
    arguments: JSON.stringify(input),
    input,
    state: 'complete',
  }
}

it('titles a click with the declared label and promotes the selector', async () => {
  mountView(() => <MetaToolCard part={part('click', {selector: '#submit'})} result={undefined} ctx={ctx} />)

  await expect.element(page.getByText('Clicked #submit')).toBeVisible()
})

it('titles a fill with the declared label and chips the typed value', async () => {
  mountView(() => (
    <MetaToolCard part={part('fill', {selector: '#email', value: 'jane@example.com'})} result={undefined} ctx={ctx} />
  ))

  await expect.element(page.getByText('Typed #email')).toBeVisible()
  await page.getByRole('button').click()
  await expect.element(page.getByText('jane@example.com')).toBeVisible()
})

it('titles a tree read verb', async () => {
  mountView(() => <MetaToolCard part={part('tree', {})} result={undefined} ctx={ctx} />)

  await expect.element(page.getByText('Read the page tree')).toBeVisible()
})

it('titles a press with the declared label and chips the pressed key', async () => {
  mountView(() => <MetaToolCard part={part('press', {key: 'Enter'})} result={undefined} ctx={ctx} />)

  await expect.element(page.getByText('Pressed')).toBeVisible()
  await page.getByRole('button').click()
  await expect.element(page.getByText('Enter')).toBeVisible()
})

it('shows the mirror affordance for a verb the page reflects back', async () => {
  mountView(() => <MetaToolCard part={part('click', {selector: '#submit'})} result={undefined} ctx={ctx} />)

  await page.getByRole('button').click()
  await expect.element(page.getByText('shown on your page')).toBeVisible()
})

it('falls back to the bare tool name when the catalog declares nothing for it', async () => {
  mountView(() => <MetaToolCard part={part('nosuchverb', {})} result={undefined} ctx={ctx} />)

  await expect.element(page.getByText('page.nosuchverb')).toBeVisible()
})
