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
  const relay = new TransformStream<T, T>()
  const writer = relay.writable.getWriter()
  const unsubscribe = subscribe((value) => void writer.write(value).catch(() => undefined))
  const stop = (): void => {
    unsubscribe()
    void writer.close().catch(() => undefined)
  }
  abortSignal?.addEventListener('abort', stop, {once: true})
  return readingValues(relay.readable)
}
