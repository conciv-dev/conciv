import type {ToolDomain} from '@conciv/plugin'
import {z} from 'zod'
import type {TestRunnerManager} from './runner/contract.js'
import {TestRunResultSchema} from './shared/events.js'
import {ListResultSchema} from './rpc.js'

const TestInput = z.object({action: z.enum(['list', 'run', 'status']), pattern: z.string().optional()})

const TestOutputSchema = z.union([ListResultSchema, TestRunResultSchema])

function answer(manager: TestRunnerManager, action: z.infer<typeof TestInput>['action'], pattern?: string) {
  if (action === 'list') return manager.list()
  if (action === 'run') return manager.run({patterns: pattern ? [pattern] : undefined})
  return Promise.resolve(manager.status())
}

export function register(tool: ToolDomain, manager: TestRunnerManager) {
  return tool.transform((editor) => {
    editor.namespace({
      name: 'test_runner',
      description: "The project's test runner: list the test files, run them or a pattern, read the last result.",
    })
    editor.add({
      name: 'test_runner',
      description: 'Drive the live test runner: list tests, run a pattern, or check status.',
      input: TestInput,
      output: TestOutputSchema,
      options: {namespace: 'test_runner', codemode: true},
      execute: async ({action, pattern}) => ({output: await answer(manager, action, pattern)}),
    })
  })
}
