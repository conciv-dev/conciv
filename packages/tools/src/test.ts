import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'
import type {AidxMcpTool, AidxToolContext} from './types.js'

export const TestInput = z.object({action: z.enum(['list', 'run', 'status']), pattern: z.string().optional()})

export const aidxTestToolDef = toolDefinition({
  name: 'aidx_test',
  description: 'Drive the live test runner: list tests, run a pattern, or check status.',
  inputSchema: TestInput,
})

export function aidxTestTool(ctx: AidxToolContext): AidxMcpTool {
  const server = aidxTestToolDef.server(async ({action, pattern}) => ctx.test({kind: action, pattern}))
  const execute = server.execute
  return {
    name: server.name,
    description: server.description,
    inputSchema: TestInput,
    run: async (args) => (execute ? execute(TestInput.parse(args)) : undefined),
  }
}
