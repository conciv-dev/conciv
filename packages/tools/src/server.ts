import {UiInputSchema} from '@conciv/protocol/ui-types'
import type {ConcivServerTool, ConcivToolContext} from './types.js'
import {PAGE_TOOL_PREFIX} from '@conciv/extension-page/defs'
import {PAGE_TOOL_NAME, pageCapabilities, pageInputFor, pageToolDescription} from './page.js'
import {concivUiToolDef} from './ui.js'
import {concivOpenToolDef, OpenInput} from './open.js'
import {buildCatalog, scaffold, validateSource} from '@conciv/extension/catalog'
import {concivExtensionsToolDef, ExtensionsInput} from './extensions-tool.js'

function concivUiServerTool(ctx: ConcivToolContext): ConcivServerTool {
  const tool = concivUiToolDef.server(() => ctx.askUi())
  const run = tool.execute
  if (!run) throw new Error('conciv_ui: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: UiInputSchema,
    execute: async (input) => run(UiInputSchema.parse(input)),
  }
}

function concivPageServerTool(ctx: ConcivToolContext): ConcivServerTool {
  const capabilities = pageCapabilities(ctx.capabilities())
  const inputSchema = pageInputFor(capabilities)
  return {
    name: PAGE_TOOL_NAME,
    description: pageToolDescription(capabilities),
    inputSchema,
    execute: async (raw) => {
      const {verb, ...input} = inputSchema.parse(raw)
      return ctx.page(`${PAGE_TOOL_PREFIX}${verb}`, input)
    },
  }
}

function concivOpenServerTool(ctx: ConcivToolContext): ConcivServerTool {
  const tool = concivOpenToolDef.server(async ({file, line}) => {
    await ctx.open(file, line)
    return {ok: true, file, ...(line === undefined ? {} : {line})}
  })
  const run = tool.execute
  if (!run) throw new Error('conciv_open: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: OpenInput,
    execute: async (input) => run(OpenInput.parse(input)),
  }
}

function concivExtensionsServerTool(): ConcivServerTool {
  const tool = concivExtensionsToolDef.server(async (input) => {
    if (input.verb === 'catalog') return buildCatalog()
    if (input.verb === 'scaffold') {
      if (!input.kind || !input.name) throw new Error('scaffold needs {kind, name}')
      return {code: scaffold(input.kind, {name: input.name})}
    }
    if (!input.source) throw new Error('validate needs {source}')
    return validateSource(input.source)
  })
  const run = tool.execute
  if (!run) throw new Error('conciv_extensions: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: ExtensionsInput,
    execute: async (input) => run(ExtensionsInput.parse(input)),
  }
}

export function concivTools(ctx: ConcivToolContext): ConcivServerTool[] {
  return [concivUiServerTool(ctx), concivPageServerTool(ctx), concivOpenServerTool(ctx), concivExtensionsServerTool()]
}

export function concivSandboxTools(ctx: ConcivToolContext): ConcivServerTool[] {
  return [concivUiServerTool(ctx), concivExtensionsServerTool()]
}
