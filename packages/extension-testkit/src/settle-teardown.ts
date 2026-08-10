export async function settleTeardown(steps: Array<() => Promise<void>>): Promise<void> {
  const results = await Promise.allSettled(steps.map((step) => step()))
  const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (firstFailure) throw firstFailure.reason
}
