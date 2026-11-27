export function pause(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      {once: true},
    )
  })
}

export function aborted(signal: AbortSignal | undefined): Promise<void> {
  if (signal === undefined) return new Promise(() => undefined)
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), {once: true}))
}

export type Pace = {
  readonly beat: (signal: AbortSignal | undefined) => Promise<void>
  readonly chunk: (signal: AbortSignal | undefined) => Promise<void>
  readonly chunks: (text: string) => readonly string[]
}

const BEAT_MS = 450

const CHARS_PER_CHUNK = 6

const CHUNK_MS = 28

export function createPace(reducedMotion: boolean): Pace {
  if (reducedMotion) return {beat: async () => undefined, chunk: async () => undefined, chunks: (text) => [text]}
  return {
    beat: (signal) => pause(BEAT_MS, signal),
    chunk: (signal) => pause(CHUNK_MS, signal),
    chunks: (text) =>
      Array.from({length: Math.ceil(text.length / CHARS_PER_CHUNK)}, (_, index) =>
        text.slice(index * CHARS_PER_CHUNK, (index + 1) * CHARS_PER_CHUNK),
      ),
  }
}
