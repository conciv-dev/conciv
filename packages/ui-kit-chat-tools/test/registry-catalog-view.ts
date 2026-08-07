import {createToolRegistry, type ToolRegistry} from '@conciv/extension/registry'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'
import type {ToolCatalogView} from '@conciv/protocol/tool-view-types'

export function registryCatalogView(registry: ToolRegistry): ToolCatalogView {
  return {loaded: () => true, meta: (name) => (registry.has(name) ? registry.catalog.get(name) : undefined)}
}

export function builtinPageRegistry(): ToolRegistry {
  const registry = createToolRegistry({pageCaller: async () => ({ok: true})})
  for (const def of PAGE_TOOL_DEFS) registry.register(def.client(), {owner: 'a built-in page tool'})
  return registry
}
