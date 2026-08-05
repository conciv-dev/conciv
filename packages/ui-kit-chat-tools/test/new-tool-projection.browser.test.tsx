import 'virtual:uno.css'
import {z} from 'zod'
import {expect, it} from 'vitest'
import {defineTool} from '@conciv/extension/tool'
import type {AnyToolBuilder} from '@conciv/extension'
import {createToolRegistry} from '@conciv/extension/registry'
import {pageCapabilities, pageInputFor, pageToolDescription} from '@conciv/tools/defs'
import {BUILTIN_PAGE_TOOLS, pageToolMetaOf} from '@conciv/tools/page-tools'
import {GENERIC_TOOL_ICON, toolIconRender} from '../src/styled/tool-icon.js'

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

const declarations = [...BUILTIN_PAGE_TOOLS, shipTool]

function registryWith(extra: AnyToolBuilder) {
  const registry = createToolRegistry({pageCaller: async () => ({ok: true})})
  for (const tool of BUILTIN_PAGE_TOOLS) registry.register(tool)
  registry.register(extra)
  return registry
}

it('one new declaration reaches the model, the label and the icon with no other change', () => {
  const capabilities = pageCapabilities(registryWith(shipTool).catalog.list())

  const description = pageToolDescription(capabilities)
  expect(description).toContain('- ship: ship the page the user is looking at')
  expect(description).toContain('only once the user has approved the diff')
  expect(pageInputFor(capabilities).parse({verb: 'ship'})).toMatchObject({verb: 'ship'})

  const meta = pageToolMetaOf('ship', declarations)
  expect(meta?.label).toEqual({running: 'Shipping the page', done: 'Shipped the page'})
  expect(toolIconRender(meta?.icon)).toBe(toolIconRender('pointer'))
  expect(toolIconRender(meta?.icon)).not.toBe(GENERIC_TOOL_ICON)
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
  expect(toolIconRender(pageToolMetaOf('plain', [plainTool])?.icon)).toBe(GENERIC_TOOL_ICON)
})
