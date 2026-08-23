import 'virtual:uno.css'
import {z} from 'zod'
import {page} from 'vitest/browser'
import {expect, it} from 'vitest'
import {defineTool} from '@conciv/extension/tool'
import type {AnyToolBuilder} from '@conciv/extension'
import {createToolRegistry} from '@conciv/extension/registry'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {PAGE_TOOL_DEFS, pageToolMetaOf} from '@conciv/extension-page/defs'
import {INERT_ADD_RESULT, GENERIC_TOOL_ICON, MetaToolCard, toolIconRender} from '@conciv/ui-kit-chat/tools'
import {nowTitle} from '@conciv/ui-kit-chat/tools'
import {mountView} from './mount-view.js'
import {registryCatalogView} from './registry-catalog-view.js'

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
  addResult: () => {},
  catalog: registryCatalogView(registryWith(shipTool)),
}

it('a newly declared capability reaches the widget through its own declaration', async () => {
  const declared = registryWith(shipTool).catalog.get('page.ship')
  expect(declared.summary).toBe('ship the page the user is looking at')
  expect(declared.hint).toBe('only once the user has approved the diff')

  mountView(() => (
    <MetaToolCard
      part={part('ship', {note: 'after review'})}
      result={undefined}
      ctx={ctx}
      addResult={INERT_ADD_RESULT}
    />
  ))

  await expect.element(page.getByText('Shipped the page', {exact: false})).toBeVisible()
  expect(nowTitle(part('ship'), ctx.catalog)).toBe('Shipping the page')
})

it('the card and the running title read a built-in declaration through the default source', async () => {
  const declared = pageToolMetaOf('setattr')
  if (!declared?.label) throw new Error('page.setattr declares no label')

  mountView(() => (
    <MetaToolCard
      part={part('setattr', {selector: '#hero', attribute: 'hidden'})}
      result={undefined}
      ctx={ctx}
      addResult={INERT_ADD_RESULT}
    />
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

  expect(registryWith(plainTool).catalog.get('page.plain').summary).toBe('do something the widget has no icon for')
  expect(toolIconRender(plainTool.meta?.icon)).toBe(GENERIC_TOOL_ICON)
})
