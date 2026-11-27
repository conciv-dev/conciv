const END = Symbol('end')

type Reader<T> = {queue: (T | typeof END)[]; wake: () => void}

export type Channel<T> = {push(value: T): void; end(): void; read(signal: AbortSignal | undefined): AsyncGenerator<T>}

export function channel<T>(): Channel<T> {
  const readers = new Set<Reader<T>>()
  const deliver = (value: T | typeof END): void =>
    readers.forEach((reader) => {
      reader.queue.push(value)
      reader.wake()
    })
  return {
    push: (value) => deliver(value),
    end: () => deliver(END),
    read: (signal) => {
      const reader: Reader<T> = {queue: [], wake: () => undefined}
      readers.add(reader)
      return readChannel(reader, () => readers.delete(reader), signal)
    },
  }
}

async function* readChannel<T>(
  reader: Reader<T>,
  leave: () => void,
  signal: AbortSignal | undefined,
): AsyncGenerator<T> {
  const stop = (): void => {
    reader.queue.push(END)
    reader.wake()
  }
  signal?.addEventListener('abort', stop, {once: true})
  try {
    while (signal?.aborted !== true) {
      const next = reader.queue.shift()
      if (next === END) return
      if (next !== undefined) {
        yield next
        continue
      }
      await new Promise<void>((resolve) => {
        reader.wake = resolve
      })
    }
  } finally {
    signal?.removeEventListener('abort', stop)
    leave()
  }
}
