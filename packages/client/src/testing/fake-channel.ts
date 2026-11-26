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
    read: (signal) => readChannel(readers, signal),
  }
}

async function* readChannel<T>(readers: Set<Reader<T>>, signal: AbortSignal | undefined): AsyncGenerator<T> {
  const reader: Reader<T> = {queue: [], wake: () => undefined}
  readers.add(reader)
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
    readers.delete(reader)
  }
}

export function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), {once: true}))
}
