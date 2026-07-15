import {UiInputSchema} from '@conciv/protocol/ui-types'
import type {ConcivServerTool, ConcivToolContext} from './types.js'
import {concivPageToolDef, PageInput} from './page.js'
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
  const tool = concivPageToolDef.server(async ({verb, ...input}) => ctx.page({kind: verb, ...input}))
  const run = tool.execute
  if (!run) throw new Error('conciv_page: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: PageInput,
    execute: (input) => run(PageInput.parse(input)),
  }
}

function concivOpenServerTool(ctx: ConcivToolContext): ConcivServerTool {
  const tool = concivOpenToolDef.server(async ({file, line}) => {
    ctx.open(file, line)
    return {ok: true, file, ...(line === undefined ? {} : {line})}
  })
  const run = tool.execute
  if (!run) throw new Error('conciv_open: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: OpenInput,
    execute: (input) => run(OpenInput.parse(input)),
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
    execute: (input) => run(ExtensionsInput.parse(input)),
  }
}

export function concivTools(ctx: ConcivToolContext): ConcivServerTool[] {
  return [concivUiServerTool(ctx), concivPageServerTool(ctx), concivOpenServerTool(ctx), concivExtensionsServerTool()]
}
