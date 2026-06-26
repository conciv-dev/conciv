import {z} from 'zod'

export const TEST_RUNNER_NAME = 'test-runner' as const

export const testRunnerConfig = z.object({
  runner: z.enum(['vitest', 'jest', 'node-test', 'playwright']).default('vitest'),
})

export const TEST_RUNNER_PROMPT =
  'You can run the project test suite with the test_runner tool (list tests, run a pattern, or check status).'
