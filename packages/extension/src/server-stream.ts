export async function* subscriptionIterator<T>(
  subscribe: (emit: (value: T) => void) => () => void,
  signal: AbortSignal | undefined,
): AsyncGenerator<T> {
  const abort = signal ?? new AbortController().signal
  const queue: {value: T}[] = []
  const waiter = {wake: () => {}}
  const stop = subscribe((value) => {
    queue.push({value})
    waiter.wake()
  })
  const onAbort = () => waiter.wake()
  abort.addEventListener('abort', onAbort, {once: true})
  try {
    while (!abort.aborted) {
      const entry = queue.shift()
      if (entry !== undefined) {
        yield entry.value
        continue
      }
      await new Promise<void>((resolve) => {
        waiter.wake = resolve
        if (queue.length > 0 || abort.aborted) resolve()
      })
      waiter.wake = () => {}
    }
  } finally {
    stop()
    abort.removeEventListener('abort', onAbort)
  }
}
