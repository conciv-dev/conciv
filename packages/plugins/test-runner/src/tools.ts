import type {Context} from '@conciv/plugin/effect/plugin'
import {Tool} from '@conciv/plugin/schema/tool'
import {Effect} from 'effect'
import {z} from 'zod'
import type {RunnerUnavailable, TestRunnerManager} from './runner.js'
import {TestRunResultSchema} from './events.js'
import {ListResultSchema} from './rpc.js'

const codeMode = {namespace: 'test_runner', codemode: true}
const direct = {namespace: 'test_runner', codemode: false}

function toolFailure(error: RunnerUnavailable) {
  return Effect.fail(Tool.toolError({message: error.message, error}))
}

export const register = Effect.fn('TestRunnerTools.register')(function* (
  ctx: Pick<Context, 'tool'>,
  manager: TestRunnerManager,
) {
  yield* ctx.tool.transform((editor) => {
    editor.namespace({
      name: 'test_runner',
      description: "The project's test runner: list the test files, run them or a pattern, read the last result.",
    })
    editor.add({
      name: 'list',
      description: 'List the test files without running them.',
      input: z.object({}),
      output: ListResultSchema,
      options: codeMode,
      execute: () =>
        manager.list(false).pipe(
          Effect.map((output) => ({output})),
          Effect.catchTag('TestRunner.RunnerUnavailable', toolFailure),
        ),
    })
    editor.add({
      name: 'run',
      description: 'Run every test, or only the test files whose path matches the pattern, and wait for the result.',
      input: z.object({pattern: z.string().optional()}),
      output: TestRunResultSchema,
      options: direct,
      execute: ({pattern}) =>
        manager.run({patterns: pattern ? [pattern] : undefined}).pipe(
          Effect.map((output) => ({output})),
          Effect.catchTag('TestRunner.RunnerUnavailable', toolFailure),
        ),
    })
    editor.add({
      name: 'status',
      description: 'Read the result of the last finished run without starting one.',
      input: z.object({}),
      output: TestRunResultSchema,
      options: direct,
      execute: () => manager.status.pipe(Effect.map((output) => ({output}))),
    })
  })
})
