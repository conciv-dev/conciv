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

export type RelaySink<T> = {emit: (value: T) => void; fail: (error: unknown) => void}

export function relayedValues<T>(
  subscribe: (sink: RelaySink<T>) => () => void,
  abortSignal?: AbortSignal,
): AsyncGenerator<T> {
  const held = {stop: () => {}}
  const readable = new ReadableStream<T>({
    start: (controller) => {
      if (abortSignal?.aborted) {
        controller.close()
        return
      }
      const unsubscribe = subscribe({
        emit: (value) => controller.enqueue(value),
        fail: (error) => {
          held.stop()
          controller.error(error)
        },
      })
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
