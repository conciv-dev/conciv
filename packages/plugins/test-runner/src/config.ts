import {z} from 'zod'

export const TestRunnerConfigSchema = z.object({
  runner: z
    .enum(['vitest', 'jest', 'node-test', 'playwright'])
    .default('vitest')
    .describe(
      'The test framework the plugin runs. jest and node-test fail the plugin when it starts. Default: vitest.',
    ),
})
