import type {ToolDomain} from '@conciv/plugin'
import {z} from 'zod'
import type {TestRunnerManager} from './runner/contract.js'
import {TestRunResultSchema} from './shared/events.js'
import {ListResultSchema} from './rpc.js'

const options = {namespace: 'test_runner', codemode: true}

export function register(tool: ToolDomain, manager: TestRunnerManager) {
  return tool.transform((editor) => {
    editor.namespace({
      name: 'test_runner',
      description: "The project's test runner: list the test files, run them or a pattern, read the last result.",
    })
    editor.add({
      name: 'list',
      description: 'List the test files without running them.',
      input: z.object({}),
      output: ListResultSchema,
      options,
      execute: async () => ({output: await manager.list()}),
    })
    editor.add({
      name: 'run',
      description: 'Run every test, or only the test files whose path matches the pattern, and wait for the result.',
      input: z.object({pattern: z.string().optional()}),
      output: TestRunResultSchema,
      options,
      execute: async ({pattern}) => ({output: await manager.run({patterns: pattern ? [pattern] : undefined})}),
    })
    editor.add({
      name: 'status',
      description: 'Read the result of the last finished run without starting one.',
      input: z.object({}),
      output: TestRunResultSchema,
      options,
      execute: async () => ({output: manager.status()}),
    })
  })
}
