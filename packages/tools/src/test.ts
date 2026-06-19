import {z} from 'zod'
import {toolDefinition} from '@tanstack/ai'

export const TestInput = z.object({action: z.enum(['list', 'run', 'status']), pattern: z.string().optional()})

export const mandaraxTestToolDef = toolDefinition({
  name: 'mandarax_test',
  description: 'Drive the live test runner: list tests, run a pattern, or check status.',
  inputSchema: TestInput,
})
