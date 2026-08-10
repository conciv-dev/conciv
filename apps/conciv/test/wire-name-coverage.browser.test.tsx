import {expect, it} from 'vitest'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import {concivToolCards} from '@conciv/tools/cards'
import {concivExtensionsToolDef, concivUiToolDef} from '@conciv/tools/defs'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOLS} from '@conciv/tools/builtins'
import {coreToolCards, EXECUTE_TOOL_NAME} from '@conciv/core/cards'
import {collectToolRenderers} from '@conciv/extension'
import {createToolRegistry} from '@conciv/extension/registry'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'
import pageExtension from '@conciv/extension-page'

function realRegistry(): ReturnType<typeof createToolRegistry> {
  const registry = createToolRegistry({pageCaller: async () => ({ok: true})})
  for (const tool of PAGE_TOOL_DEFS) registry.register(tool.client(), {owner: 'a built-in page tool'})
  for (const tool of BUILTIN_SERVER_TOOLS) {
    registry.register(tool, {owner: 'a built-in server tool', context: {bundler: () => undefined}})
  }
  registry.register(BUILTIN_OPEN_TOOL, {owner: 'a built-in editor tool', context: {openInEditor: () => {}}})
  return registry
}

const registry = realRegistry()

const modelReachableNames = [
  EXECUTE_TOOL_NAME,
  concivUiToolDef.name,
  concivExtensionsToolDef.name,
  ...registry.catalog.list().map((entry) => entry.name),
]

const concivOwnedCards: ToolCardEntry[] = [
  ...collectToolRenderers([pageExtension]),
  ...concivToolCards,
  ...coreToolCards,
]

const cardNames = new Set([...concivOwnedCards, ...builtinToolCards].flatMap((entry) => entry.names))

it('every model-reachable tool name resolves to a card entry or catalog meta', () => {
  expect(modelReachableNames.length).toBeGreaterThan(10)
  const unresolved = modelReachableNames.filter(
    (name) => !cardNames.has(name) && registry.catalog.list().every((entry) => entry.name !== name),
  )
  expect(unresolved).toEqual([])
})

it('no conciv-owned card is registered for a name the model can never put on the wire', () => {
  const reachable = new Set(modelReachableNames)
  const dead = concivOwnedCards.flatMap((entry) => entry.names).filter((name) => !reachable.has(name))
  expect(dead).toEqual([])
})
