import {z} from 'zod'

export const TestInput = z.object({action: z.enum(['list', 'run', 'status']), pattern: z.string().optional()})

export const testToolDef = {
  name: 'test_runner',
  description: 'Drive the live test runner: list tests, run a pattern, or check status.',
  inputSchema: TestInput,
  streamTitle: 'Running tests',
}
