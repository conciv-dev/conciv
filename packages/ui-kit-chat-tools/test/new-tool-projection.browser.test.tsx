import 'virtual:uno.css'
import {z} from 'zod'
import {page} from 'vitest/browser'
import {afterEach, expect, it} from 'vitest'
import {defineTool} from '@conciv/extension/tool'
import type {AnyToolBuilder} from '@conciv/extension'
import {createToolRegistry} from '@conciv/extension/registry'
import {concivTools} from '@conciv/tools'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {pageCapabilities, pageInputFor, pageToolDescription} from '@conciv/tools/defs'
import {PAGE_TOOL_DEFS, pageToolMetaOf} from '@conciv/extension-page/defs'
import {GENERIC_TOOL_ICON, MetaToolCard, toolIconRender} from '@conciv/ui-kit-chat'
import {nowTitle} from '../src/primitives/tools/now-title.js'
import {cleanupViews, mountView} from './mount-view.js'
import {registryCatalogView} from './registry-catalog-view.js'

afterEach(() => {
  cleanupViews()
})

function part(verb: string, args: Record<string, unknown> = {}): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'p1',
    name: `page.${verb}`,
    arguments: JSON.stringify(args),
    input: args,
    state: 'complete',
  }
}

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
    hint: 'only once the user has approved the diff',
  },
}).client()

function registryWith(extra: AnyToolBuilder) {
  const registry = createToolRegistry({pageCaller: async () => ({ok: true})})
  for (const tool of PAGE_TOOL_DEFS) registry.register(tool.client(), {owner: 'a built-in page tool'})
  registry.register(extra, {owner: 'a test registrant'})
  return registry
}

const ctx: ToolViewCtx = {
  apiBase: '',
  harnessId: 'test',
  sendMessage: () => {},
  catalog: registryCatalogView(registryWith(shipTool)),
}

it('a newly declared capability reaches the model and survives its own advertised schema', async () => {
  const calls: unknown[] = []
  const capabilities = pageCapabilities(registryWith(shipTool).catalog.list())

  const description = pageToolDescription(capabilities)
  expect(description).toContain('- ship: ship the page the user is looking at')
  expect(description).toContain('only once the user has approved the diff')
  expect(pageInputFor(capabilities).parse({verb: 'ship'})).toMatchObject({verb: 'ship'})

  const tools = concivTools({
    capabilities: () => capabilities,
    askUi: async () => ({answered: false, note: ''}),
    page: async (name, input) => (calls.push([name, input]), {ok: true}),
    open: async () => ({ok: true}),
  })
  const pageTool = tools.find((tool) => tool.name === 'conciv_page')
  if (!pageTool) throw new Error('conciv_page tool missing')

  await expect(pageTool.execute({verb: 'ship', note: 'after review'})).resolves.toMatchObject({ok: true})
  expect(calls[0]).toEqual(['page.ship', {note: 'after review'}])
})

it('the card and the running title read a built-in declaration through the default source', async () => {
  const declared = pageToolMetaOf('setattr')
  if (!declared?.label) throw new Error('page.setattr declares no label')

  mountView(() => (
    <MetaToolCard part={part('setattr', {selector: '#hero', attribute: 'hidden'})} result={undefined} ctx={ctx} />
  ))

  await expect.element(page.getByText(`${declared.label.done} #hero`, {exact: true})).toBeVisible()
  expect(nowTitle(part('setattr'), ctx.catalog)).toBe(declared.label.running)
  expect(toolIconRender(declared.icon)).toBe(toolIconRender('edit'))
  expect(toolIconRender(declared.icon)).not.toBe(GENERIC_TOOL_ICON)
})

it('a declaration with no icon key falls back to the generic icon', () => {
  const plainTool = defineTool({
    name: 'page.plain',
    description: 'do something the widget has no icon for',
    inputSchema: z.object({}),
    outputSchema: z.object({ok: z.literal(true)}),
    meta: {summary: 'do something the widget has no icon for', category: 'act'},
  }).client()

  const capabilities = pageCapabilities(registryWith(plainTool).catalog.list())
  expect(pageToolDescription(capabilities)).toContain('- plain: do something the widget has no icon for')
  expect(toolIconRender(plainTool.meta?.icon)).toBe(GENERIC_TOOL_ICON)
})
