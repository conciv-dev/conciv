export async function disposeAll(
  disposers: ReadonlyArray<() => Promise<void>>,
  order: 'sequential' | 'parallel',
  message: string,
): Promise<void> {
  const outcomes =
    order === 'parallel'
      ? await Promise.allSettled(disposers.map((dispose) => dispose()))
      : await disposers.reduce<Promise<PromiseSettledResult<void>[]>>(
          async (pending, dispose) => [...(await pending), ...(await Promise.allSettled([dispose()]))],
          Promise.resolve([]),
        )
  const failures = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []))
  if (failures.length > 0) throw new AggregateError(failures, message)
}
