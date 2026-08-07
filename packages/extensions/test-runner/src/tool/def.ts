import {toolDefinition} from '@conciv/extension/tool'
import {z} from 'zod'
import {TestRunResultSchema} from '../shared/events.js'
import {TEST_RUNNER_NAME} from '../shared/meta.js'

export const TestInput = z.object({action: z.enum(['list', 'run', 'status']), pattern: z.string().optional()})

const ListResultSchema = z.object({
  files: z.array(z.object({file: z.string(), relPath: z.string(), lastState: z.string().optional()})),
})

export const TestOutputSchema = z.union([ListResultSchema, TestRunResultSchema])

export const testToolDef = toolDefinition({
  name: 'test_runner',
  description: 'Drive the live test runner: list tests, run a pattern, or check status.',
  inputSchema: TestInput,
  outputSchema: TestOutputSchema,
  streamTitle: 'Running tests',
  meta: {
    summary: 'drive the live test runner: list, run a pattern, or check status',
    category: TEST_RUNNER_NAME,
    mutating: false,
    keywords: ['test', 'runner', 'vitest', 'suite'],
    icon: 'script',
    label: {running: 'Running the tests', done: 'Ran the tests'},
    hint: 'action list answers with test files, run and status answer with a summary, failures and test rows',
  },
})
