import 'virtual:uno.css'
import {afterEach, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {
  ToolCardEntry,
  ToolCatalogView,
  ToolUIComponent,
  ToolViewCtx,
  ToolViewMeta,
} from '@conciv/protocol/tool-view-types'
import {ToolCallCard} from '../src/styled/tools/tool-call-card.js'
import {cleanupViews, mountView} from './mount-view.js'

afterEach(() => {
  cleanupViews()
})

const shipMeta: ToolViewMeta = {
  summary: 'ship the page the user is looking at',
  label: {running: 'Shipping the page', done: 'Shipped the page'},
  category: 'act',
  icon: 'pointer',
  mutating: false,
  mirrors: false,
  inputSchema: {type: 'object', properties: {note: {type: 'string'}}},
}

function catalogOf(entries: Record<string, ToolViewMeta>): ToolCatalogView {
  return {loaded: () => true, meta: (name) => entries[name]}
}

function ctxWith(catalog: ToolCatalogView): ToolViewCtx {
  return {apiBase: '', harnessId: 'test', sendMessage: () => {}, catalog, respondApproval: () => {}}
}

function part(name: string, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  const input = {note: 'after review'}
  return {type: 'tool-call', id: 'c1', name, arguments: JSON.stringify(input), input, state}
}

function cardSaying(text: string): ToolUIComponent {
  return () => <p>{text}</p>
}

const extensionEntry: ToolCardEntry = {names: ['page.ship'], render: cardSaying('the extension card')}
const builtinEntry: ToolCardEntry = {names: ['page.ship'], render: cardSaying('the builtin card')}

it('an extension-supplied card wins over the builtin card for the same tool', async () => {
  mountView(() => (
    <ToolCallCard
      part={part('page.ship')}
      result={undefined}
      ctx={ctxWith(catalogOf({'page.ship': shipMeta}))}
      tools={() => [extensionEntry, builtinEntry]}
    />
  ))

  await expect.element(page.getByText('the extension card')).toBeVisible()
  expect(document.body.textContent).not.toContain('the builtin card')
})

it('a builtin card wins over the meta-driven default card', async () => {
  mountView(() => (
    <ToolCallCard
      part={part('page.ship')}
      result={undefined}
      ctx={ctxWith(catalogOf({'page.ship': shipMeta}))}
      tools={() => [builtinEntry]}
    />
  ))

  await expect.element(page.getByText('the builtin card')).toBeVisible()
  expect(document.body.textContent).not.toContain('Shipped the page')
})

it('the meta-driven default card wins over the raw fallback whenever the tool declares meta', async () => {
  mountView(() => (
    <ToolCallCard
      part={part('page.ship')}
      result={undefined}
      ctx={ctxWith(catalogOf({'page.ship': shipMeta}))}
      tools={() => []}
    />
  ))

  await expect.element(page.getByText('Shipped the page')).toBeVisible()
  expect(document.body.textContent).not.toContain('Used tool:')
})

it('a tool the catalog knows nothing about still reaches the raw fallback', async () => {
  mountView(() => (
    <ToolCallCard
      part={part('mcp__weather__forecast')}
      result={undefined}
      ctx={ctxWith(catalogOf({}))}
      tools={() => []}
    />
  ))

  await expect.element(page.getByText('mcp__weather__forecast')).toBeVisible()
  expect(document.body.textContent).toContain('Used tool:')
})

it('a tool that only reaches the meta-driven default still renders its inline approval prompt', async () => {
  const approval: ToolCallPart = {
    ...part('page.ship', 'approval-requested'),
    approval: {id: 'ap1', needsApproval: true},
  }
  mountView(() => (
    <ToolCallCard
      part={approval}
      result={undefined}
      ctx={ctxWith(catalogOf({'page.ship': shipMeta}))}
      tools={() => []}
    />
  ))

  await expect.element(page.getByText('Run this action?')).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Allow'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Deny'})).toBeVisible()
})
