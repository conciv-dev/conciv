import 'virtual:uno.css'
import {z} from 'zod'
import {createSignal} from 'solid-js'
import {page} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import {defineTool} from '@conciv/extension/tool'
import {createToolRegistry} from '@conciv/extension/registry'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'
import {PageActionCard} from '../src/styled/page-action-card.js'
import {nowTitle} from '../src/primitives/tools/now-title.js'
import {cleanupViews, mountView} from './mount-view.js'
import {registryCatalogView} from './registry-catalog-view.js'

afterEach(() => {
  cleanupViews()
})

const shipTool = defineTool({
  name: 'page.ship',
  description: 'ship the page the user is looking at',
  inputSchema: z.object({note: z.string().optional()}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {
    summary: 'ship the page the user is looking at',
    category: 'act',
    icon: 'pointer',
    label: {running: 'Shipping the page', done: 'Shipped the page'},
  },
}).client()

const bannerTool = defineTool({
  name: 'page.banner',
  description: 'paint a banner over the page',
  inputSchema: z.object({value: z.string().optional()}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {
    summary: 'paint a banner over the page',
    category: 'act',
    icon: 'edit',
    label: {running: 'Painting the banner', done: 'Painted the banner'},
    mutating: true,
    mirrors: true,
  },
}).client()

const plainTool = defineTool({
  name: 'page.plain',
  description: 'do something the widget has no cosmetics for',
  inputSchema: z.object({}),
  outputSchema: z.object({ok: z.literal(true)}),
  meta: {summary: 'do something the widget has no cosmetics for', category: 'act'},
}).client()

function declaredRegistry() {
  const registry = createToolRegistry({pageCaller: async () => ({ok: true})})
  for (const def of PAGE_TOOL_DEFS) registry.register(def.client(), {owner: 'a built-in page tool'})
  for (const tool of [shipTool, bannerTool, plainTool]) registry.register(tool, {owner: 'a test registrant'})
  return registry
}

function ctxWith(catalog: ToolCatalogView): ToolViewCtx {
  return {apiBase: '', harnessId: 'test', sendMessage: () => {}, catalog}
}

function part(args: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'p1', name: 'conciv_page', arguments: JSON.stringify(args), input: args, state}
}

function result(payload: unknown): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'p1', content: JSON.stringify(payload), state: 'complete'}
}

const GENERIC_PAGE_TITLE = 'Page action'

it('a non-builtin registry page tool renders its declared labels instead of the generic card', async () => {
  const catalog = registryCatalogView(declaredRegistry())

  mountView(() => <PageActionCard part={part({verb: 'ship'})} result={undefined} ctx={ctxWith(catalog)} />)

  await expect.element(page.getByText('Shipped the page')).toBeVisible()
  expect(document.body.textContent).not.toContain(GENERIC_PAGE_TITLE)
  expect(nowTitle(part({verb: 'ship'}, 'input-streaming'), catalog)).toBe('Shipping the page')
  await page.screenshot({path: '__screenshots__/catalog-cards/declared-non-builtin.png'})
})

it('a mutating mirroring registry tool hides its result and shows the mirror row', async () => {
  const catalog = registryCatalogView(declaredRegistry())

  mountView(() => <PageActionCard part={part({verb: 'banner'})} result={result({ok: true})} ctx={ctxWith(catalog)} />)

  await page.getByRole('button').click()
  await expect.element(page.getByText('shown on your page')).toBeVisible()
  expect(document.body.textContent).not.toContain('"ok"')
})

it('a non-mutating registry tool still shows its result', async () => {
  const catalog = registryCatalogView(declaredRegistry())

  mountView(() => (
    <PageActionCard part={part({verb: 'ship'})} result={result({value: 'shipped-42'})} ctx={ctxWith(catalog)} />
  ))

  await page.getByRole('button').click()
  await expect.element(page.getByText('shipped-42')).toBeVisible()
})

it('a declared tool with no cosmetics renders a derived title, never the generic card', async () => {
  const catalog = registryCatalogView(declaredRegistry())

  mountView(() => <PageActionCard part={part({verb: 'plain'})} result={undefined} ctx={ctxWith(catalog)} />)

  await expect.element(page.getByText('do something the widget has no cosmetics for')).toBeVisible()
  expect(document.body.textContent).not.toContain(GENERIC_PAGE_TITLE)
})

it('the generic page card renders only for a tool the loaded catalog lacks', async () => {
  const catalog = registryCatalogView(declaredRegistry())

  mountView(() => <PageActionCard part={part({verb: 'teleport'})} result={undefined} ctx={ctxWith(catalog)} />)

  await expect.element(page.getByText(GENERIC_PAGE_TITLE)).toBeVisible()
})

it('a declared tool never passes through the generic card while the catalog is still loading', async () => {
  const [loaded, setLoaded] = createSignal(false)
  const listed = registryCatalogView(declaredRegistry())
  const catalog: ToolCatalogView = {loaded: () => loaded(), meta: (name) => listed.meta(name)}

  mountView(() => <PageActionCard part={part({verb: 'ship'})} result={undefined} ctx={ctxWith(catalog)} />)

  await expect.element(page.getByText('ship')).toBeVisible()
  expect(document.body.textContent).not.toContain(GENERIC_PAGE_TITLE)
  await page.screenshot({path: '__screenshots__/catalog-cards/pending-catalog.png'})

  setLoaded(true)

  await expect.element(page.getByText('Shipped the page')).toBeVisible()
  expect(document.body.textContent).not.toContain(GENERIC_PAGE_TITLE)
})
