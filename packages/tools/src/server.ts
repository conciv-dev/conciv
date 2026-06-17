import {randomUUID} from 'node:crypto'
import {buildUiSpec} from '@opendui/aidx-protocol/ui-types'
import type {AidxServerTool, AidxToolContext} from './types.js'
import {aidxPageToolDef, PageInput} from './page.js'
import {aidxTestToolDef, TestInput} from './test.js'
import {aidxUiToolDef, UiInput} from './ui.js'
import {aidxOpenToolDef, OpenInput} from './open.js'

// Each factory instantiates its definition as a tanstack server tool (the def stays the single
// source of truth — the future page agent instantiates the same def with `.client()`), then erases
// the per-tool generics to the uniform AidxServerTool the MCP server iterates. The uniform execute
// validates raw args against the concrete zod schema once at the boundary before running.

function aidxUiServerTool(ctx: AidxToolContext): AidxServerTool {
  const tool = aidxUiToolDef.server(async (input) => {
    const renderId = randomUUID()
    return {renderId, injected: ctx.injectUi(buildUiSpec(input, renderId))}
  })
  const run = tool.execute
  if (!run) throw new Error('aidx_ui: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: UiInput,
    execute: (input) => run(UiInput.parse(input)),
  }
}

function aidxPageServerTool(ctx: AidxToolContext): AidxServerTool {
  const tool = aidxPageToolDef.server(async ({verb, ...input}) => ctx.page({kind: verb, ...input}))
  const run = tool.execute
  if (!run) throw new Error('aidx_page: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: PageInput,
    execute: (input) => run(PageInput.parse(input)),
  }
}

function aidxTestServerTool(ctx: AidxToolContext): AidxServerTool {
  const tool = aidxTestToolDef.server(async ({action, pattern}) => ctx.test({kind: action, pattern}))
  const run = tool.execute
  if (!run) throw new Error('aidx_test: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: TestInput,
    execute: (input) => run(TestInput.parse(input)),
  }
}

function aidxOpenServerTool(ctx: AidxToolContext): AidxServerTool {
  const tool = aidxOpenToolDef.server(async ({file, line}) => {
    ctx.open(file, line)
    return {ok: true, file, ...(line === undefined ? {} : {line})}
  })
  const run = tool.execute
  if (!run) throw new Error('aidx_open: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: OpenInput,
    execute: (input) => run(OpenInput.parse(input)),
  }
}

// The aidx tool list as bound server tools, in one place so the MCP server (and tests) get them
// with a single import.
export function aidxTools(ctx: AidxToolContext): AidxServerTool[] {
  return [aidxUiServerTool(ctx), aidxPageServerTool(ctx), aidxTestServerTool(ctx), aidxOpenServerTool(ctx)]
}
