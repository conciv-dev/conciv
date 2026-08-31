import 'virtual:uno.css'
import {z} from 'zod'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {defineTool} from '@conciv/extension/tool'
import {createToolRegistry} from '@conciv/extension/registry'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'
import {INERT_ADD_RESULT, MetaToolCard} from '@conciv/ui-kit-chat/tools'
import {nowTitle} from '@conciv/ui-kit-chat/tools'
import {mountView} from './mount-view.js'
import {registryCatalogView} from './registry-catalog-view.js'

const shipTool = defineTool({
  name: 'page_ship',
  description: 'ship the page the user is looking at',
  inputSchema: z.object({selector: z.string(), note: z.string().optional()}),
  outputSchema: z.string(),
  meta: {
    summary: 'ship the page the user is looking at',
    category: 'act',
    icon: 'pointer',
    label: {running: 'Shipping the page', done: 'Shipped the page'},
    positional: 'selector',
  },
}).client()

const bannerTool = defineTool({
  name: 'page_banner',
  description: 'paint a banner over the page',
  inputSchema: z.object({value: z.string().optional()}),
  outputSchema: z.object({ok: z.literal(true)}),
  errors: {NO_CANVAS: {message: 'this page has nowhere to paint a banner'}},
  meta: {
    summary: 'paint a banner over the page',
    category: 'act',
    icon: 'edit',
    label: {running: 'Painting the banner', done: 'Painted the banner'},
    mutating: true,
    mirrors: true,
    hint: 'the banner disappears on the next navigation',
  },
}).client()

const plainTool = defineTool({
  name: 'page_plain',
  description: 'do something the widget has no cosmetics for',
  inputSchema: z.object({}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {summary: 'do something the widget has no cosmetics for', category: 'act'},
}).client()

const countTool = defineTool({
  name: 'page_count',
  description: 'count the elements the page shows',
  inputSchema: z.object({}),
  outputSchema: z.number(),
  meta: {summary: 'count the elements the page shows', category: 'read', icon: 'read'},
}).client()

function declaredRegistry() {
  const registry = createToolRegistry({pageCaller: async () => ({ok: true})})
  for (const def of PAGE_TOOL_DEFS) registry.register(def.client(), {owner: 'a built-in page tool'})
  for (const tool of [shipTool, bannerTool, plainTool, countTool]) registry.register(tool, {owner: 'a test registrant'})
  return registry
}

function ctxWith(catalog: ToolCatalogView): ToolViewCtx {
  return {apiBase: '', harnessId: 'test', sendMessage: () => {}, addResult: () => {}, catalog}
}

function part(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'p1', name, arguments: JSON.stringify(input), input, state}
}

function result(content: string, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'p1', content, state}
}

it('a non-builtin registry tool renders its declared labels and its positional argument', async () => {
  const catalog = registryCatalogView(declaredRegistry())

  mountView(() => (
    <MetaToolCard
      part={part('page_ship', {selector: '#hero'})}
      result={undefined}
      ctx={ctxWith(catalog)}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expect.element(page.getByText('Shipped the page #hero')).toBeVisible()
  expect(nowTitle(part('page_ship', {selector: '#hero'}, 'input-streaming'), catalog)).toBe('Shipping the page')
  await page.screenshot({path: '__screenshots__/catalog-cards/declared-non-builtin.png'})
})

it('a mutating mirroring registry tool shows its write badge, its hint and the mirror row', async () => {
  const catalog = registryCatalogView(declaredRegistry())

  mountView(() => (
    <MetaToolCard
      part={part('page_banner', {value: 'Sale'})}
      result={result('{"ok":true}')}
      ctx={ctxWith(catalog)}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expect.element(page.getByText('page edit')).toBeVisible()
  await page.getByRole('button').click()
  await expect.element(page.getByText('shown on your page')).toBeVisible()
  await expect.element(page.getByText('the banner disappears on the next navigation')).toBeVisible()
})

it('a tool declaring an error renders the declared message instead of the raw failure string', async () => {
  const catalog = registryCatalogView(declaredRegistry())

  mountView(() => (
    <MetaToolCard
      part={part('page_banner', {value: 'Sale'})}
      result={result('{"error":{"message":"page_banner failed","code":"NO_CANVAS"}}', 'error')}
      ctx={ctxWith(catalog)}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await page.getByRole('button').click()
  await expect.element(page.getByText('this page has nowhere to paint a banner')).toBeVisible()
  expect(document.body.textContent).not.toContain('page_banner failed')
})

it('a string output schema renders the result as a code block', async () => {
  const catalog = registryCatalogView(declaredRegistry())

  mountView(() => (
    <MetaToolCard
      part={part('page_ship', {selector: '#hero'})}
      result={result(JSON.stringify('shipped-42'))}
      ctx={ctxWith(catalog)}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await page.getByRole('button').click()
  await expect.element(page.getByText('shipped-42', {exact: true})).toBeVisible()
})

it('a scalar output schema renders the result as a chip', async () => {
  const catalog = registryCatalogView(declaredRegistry())

  mountView(() => (
    <MetaToolCard
      part={part('page_count', {})}
      result={result('7')}
      ctx={ctxWith(catalog)}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await page.getByRole('button').click()
  await expect.element(page.getByText('7')).toBeVisible()
})

it('a declared tool with no cosmetics still renders its summary as the title', async () => {
  const catalog = registryCatalogView(declaredRegistry())

  mountView(() => (
    <MetaToolCard
      part={part('page_plain', {})}
      result={undefined}
      ctx={ctxWith(catalog)}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expect.element(page.getByText('do something the widget has no cosmetics for').first()).toBeVisible()
})
