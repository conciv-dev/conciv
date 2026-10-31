export async function* readingValues<T>(readable: ReadableStream<T>): AsyncGenerator<T> {
  const reader = readable.getReader()
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) return
      yield next.value
    }
  } finally {
    reader.releaseLock()
  }
}

export function relayedValues<T>(
  subscribe: (emit: (value: T) => void) => () => void,
  abortSignal?: AbortSignal,
): AsyncGenerator<T> {
  const readable = new ReadableStream<T>({
    start: (controller) => {
      if (abortSignal?.aborted) {
        controller.close()
        return
      }
      const unsubscribe = subscribe((value) => controller.enqueue(value))
      abortSignal?.addEventListener(
        'abort',
        () => {
          unsubscribe()
          controller.close()
        },
        {once: true},
      )
    },
  })
  return readingValues(readable)
}
