import {z} from 'zod'

// Shared, runtime-free tool definition. The server view adds .server(execute); the client view adds
// .render(card). Splitting on a plain def keeps the node build free of the Solid card.
export const TestInput = z.object({action: z.enum(['list', 'run', 'status']), pattern: z.string().optional()})

export const testToolDef = {
  name: 'test_runner',
  description: 'Drive the live test runner: list tests, run a pattern, or check status.',
  inputSchema: TestInput,
  streamTitle: 'Running tests',
}
