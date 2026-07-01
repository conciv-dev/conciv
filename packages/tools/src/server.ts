import {randomUUID} from 'node:crypto'
import {buildUiSpec} from '@conciv/protocol/ui-types'
import type {ConcivServerTool, ConcivToolContext} from './types.js'
import {concivPageToolDef, PageInput} from './page.js'
import {concivUiToolDef, UiInput} from './ui.js'
import {concivOpenToolDef, OpenInput} from './open.js'
import {buildCatalog, scaffold, validateSource} from '@conciv/extension/catalog'
import {concivExtensionsToolDef, ExtensionsInput} from './extensions-tool.js'

// Each factory instantiates its definition as a tanstack server tool (the def stays the single
// source of truth — the future page agent instantiates the same def with `.client()`), then erases
// the per-tool generics to the uniform ConcivServerTool the MCP server iterates. The uniform execute
// validates raw args against the concrete zod schema once at the boundary before running.

function concivUiServerTool(ctx: ConcivToolContext): ConcivServerTool {
  const tool = concivUiToolDef.server(async (input) => {
    const renderId = randomUUID()
    return {renderId, injected: ctx.injectUi(buildUiSpec(input, renderId))}
  })
  const run = tool.execute
  if (!run) throw new Error('conciv_ui: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: UiInput,
    execute: (input) => run(UiInput.parse(input)),
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

// Stateless (no ctx): catalog/scaffold/validate are pure projections of node-safe extension metadata.
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

// The conciv tool list as bound server tools, in one place so the MCP server (and tests) get them
// with a single import.
export function concivTools(ctx: ConcivToolContext): ConcivServerTool[] {
  return [concivUiServerTool(ctx), concivPageServerTool(ctx), concivOpenServerTool(ctx), concivExtensionsServerTool()]
}
