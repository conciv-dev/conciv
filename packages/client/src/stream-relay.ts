export async function* readingValues<T>(readable: ReadableStream<T>): AsyncGenerator<T> {
  const reader = readable.getReader()
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) return
      yield next.value
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}

export function relayedValues<T>(
  subscribe: (emit: (value: T) => void) => () => void,
  abortSignal?: AbortSignal,
): AsyncGenerator<T> {
  const held = {stop: () => {}}
  const readable = new ReadableStream<T>({
    start: (controller) => {
      if (abortSignal?.aborted) {
        controller.close()
        return
      }
      const unsubscribe = subscribe((value) => controller.enqueue(value))
      const onAbort = () => {
        unsubscribe()
        controller.close()
      }
      held.stop = () => {
        abortSignal?.removeEventListener('abort', onAbort)
        unsubscribe()
      }
      abortSignal?.addEventListener('abort', onAbort, {once: true})
    },
    cancel: () => held.stop(),
  })
  return readingValues(readable)
}
