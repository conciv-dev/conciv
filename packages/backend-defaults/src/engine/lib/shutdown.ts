export type ShutdownStep = () => unknown

export async function runInOrder(steps: readonly ShutdownStep[], message: string): Promise<void> {
  const failures = await steps.reduce<Promise<unknown[]>>(async (earlier, step) => {
    const failed = await earlier
    try {
      await step()
      return failed
    } catch (error) {
      return [...failed, error]
    }
  }, Promise.resolve([]))
  if (failures.length > 0) throw new AggregateError(failures, message)
}
