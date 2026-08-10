import pTimeout from 'p-timeout'

const DEFAULT_STEP_TIMEOUT_MS = 20_000

export type TeardownStep = {
  name: string
  run: () => Promise<void>
  timeoutMs?: number
}

export async function settleTeardown(steps: readonly TeardownStep[]): Promise<void> {
  const results = await Promise.allSettled(
    steps.map((step) => {
      const milliseconds = step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS
      return pTimeout(step.run(), {
        milliseconds,
        message: `testkit ${step.name} exceeded ${milliseconds}ms`,
      })
    }),
  )
  const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (firstFailure) throw firstFailure.reason
}
