import {wrapToolDefinition, type ToolDefinition} from '@mandarax/extensions'
import type {MandaraxServerTool, MandaraxToolContext} from './types.js'
import {createPageToolDefinition} from './page.js'
import {createEffectToolDefinition} from './effect.js'
import {createUiToolDefinition} from './ui.js'
import {createTestToolDefinition} from './test.js'
import {createOpenToolDefinition} from './open.js'
import {createExtensionsToolDefinition} from './extensions-tool.js'

export type {MandaraxServerTool, MandaraxToolContext} from './types.js'

export type ToolName = 'page' | 'effect' | 'ui' | 'test' | 'open' | 'extensions'
export const allToolNames: Set<ToolName> = new Set(['page', 'effect', 'ui', 'test', 'open', 'extensions'])

// Pi's createToolDefinition switch: a pure factory per built-in, ctx-injected. No registry, no mutation.
export function createToolDefinition(name: ToolName, ctx: MandaraxToolContext): ToolDefinition {
  switch (name) {
    case 'page':
      return createPageToolDefinition(ctx)
    case 'effect':
      return createEffectToolDefinition(ctx)
    case 'ui':
      return createUiToolDefinition(ctx)
    case 'test':
      return createTestToolDefinition(ctx)
    case 'open':
      return createOpenToolDefinition(ctx)
    case 'extensions':
      return createExtensionsToolDefinition()
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

export function createAllToolDefinitions(ctx: MandaraxToolContext): Record<ToolName, ToolDefinition> {
  return {
    page: createPageToolDefinition(ctx),
    effect: createEffectToolDefinition(ctx),
    ui: createUiToolDefinition(ctx),
    test: createTestToolDefinition(ctx),
    open: createOpenToolDefinition(ctx),
    extensions: createExtensionsToolDefinition(),
  }
}

// The mandarax tool list as wire tools the MCP server registers, in one place for core + tests.
export function mandaraxTools(ctx: MandaraxToolContext): MandaraxServerTool[] {
  return Object.values(createAllToolDefinitions(ctx)).map(wrapToolDefinition)
}
