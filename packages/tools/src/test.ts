import {z} from 'zod'
import {defineTool, type ToolDefinition} from '@mandarax/extensions'
import type {MandaraxToolContext} from './types.js'

export const TestInput = z.object({action: z.enum(['list', 'run', 'status']), pattern: z.string().optional()})

export function createTestToolDefinition(ctx: MandaraxToolContext): ToolDefinition<typeof TestInput> {
  return defineTool({
    name: 'mandarax_test',
    label: 'Test',
    description: 'Drive the live test runner: list tests, run a pattern, or check status.',
    parameters: TestInput,
    execute: ({action, pattern}) => ctx.test({kind: action, pattern}),
  })
}
