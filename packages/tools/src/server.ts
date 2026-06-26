import {randomUUID} from 'node:crypto'
import {buildUiSpec} from '@mandarax/protocol/ui-types'
import type {MandaraxServerTool, MandaraxToolContext} from './types.js'
import {mandaraxPageToolDef, PageInput} from './page.js'
import {mandaraxUiToolDef, UiInput} from './ui.js'
import {mandaraxOpenToolDef, OpenInput} from './open.js'
import {buildCatalog, scaffold, validateSource} from '@mandarax/extension/catalog'
import {mandaraxExtensionsToolDef, ExtensionsInput} from './extensions-tool.js'

// Each factory instantiates its definition as a tanstack server tool (the def stays the single
// source of truth — the future page agent instantiates the same def with `.client()`), then erases
// the per-tool generics to the uniform MandaraxServerTool the MCP server iterates. The uniform execute
// validates raw args against the concrete zod schema once at the boundary before running.

function mandaraxUiServerTool(ctx: MandaraxToolContext): MandaraxServerTool {
  const tool = mandaraxUiToolDef.server(async (input) => {
    const renderId = randomUUID()
    return {renderId, injected: ctx.injectUi(buildUiSpec(input, renderId))}
  })
  const run = tool.execute
  if (!run) throw new Error('mandarax_ui: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: UiInput,
    execute: (input) => run(UiInput.parse(input)),
  }
}

function mandaraxPageServerTool(ctx: MandaraxToolContext): MandaraxServerTool {
  const tool = mandaraxPageToolDef.server(async ({verb, ...input}) => ctx.page({kind: verb, ...input}))
  const run = tool.execute
  if (!run) throw new Error('mandarax_page: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: PageInput,
    execute: (input) => run(PageInput.parse(input)),
  }
}

function mandaraxOpenServerTool(ctx: MandaraxToolContext): MandaraxServerTool {
  const tool = mandaraxOpenToolDef.server(async ({file, line}) => {
    ctx.open(file, line)
    return {ok: true, file, ...(line === undefined ? {} : {line})}
  })
  const run = tool.execute
  if (!run) throw new Error('mandarax_open: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: OpenInput,
    execute: (input) => run(OpenInput.parse(input)),
  }
}

// Stateless (no ctx): catalog/scaffold/validate are pure projections of node-safe extension metadata.
function mandaraxExtensionsServerTool(): MandaraxServerTool {
  const tool = mandaraxExtensionsToolDef.server(async (input) => {
    if (input.verb === 'catalog') return buildCatalog()
    if (input.verb === 'scaffold') {
      if (!input.kind || !input.name) throw new Error('scaffold needs {kind, name}')
      return {code: scaffold(input.kind, {name: input.name})}
    }
    if (!input.source) throw new Error('validate needs {source}')
    return validateSource(input.source)
  })
  const run = tool.execute
  if (!run) throw new Error('mandarax_extensions: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: ExtensionsInput,
    execute: (input) => run(ExtensionsInput.parse(input)),
  }
}

// The mandarax tool list as bound server tools, in one place so the MCP server (and tests) get them
// with a single import.
export function mandaraxTools(ctx: MandaraxToolContext): MandaraxServerTool[] {
  return [
    mandaraxUiServerTool(ctx),
    mandaraxPageServerTool(ctx),
    mandaraxOpenServerTool(ctx),
    mandaraxExtensionsServerTool(),
  ]
}
