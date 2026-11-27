function pause(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
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

export type Hold = {
  readonly hold: () => void
  readonly resume: () => void
  readonly wait: (signal: AbortSignal | undefined) => Promise<void>
}

export function createHold(): Hold {
  const state: {held: PromiseWithResolvers<void> | undefined} = {held: undefined}
  return {
    hold: () => {
      state.held ??= Promise.withResolvers<void>()
    },
    resume: () => {
      state.held?.resolve()
      state.held = undefined
    },
    wait: (signal) =>
      state.held === undefined ? Promise.resolve() : Promise.race([state.held.promise, aborted(signal)]),
  }
}

export type Pace = {
  readonly beat: (signal: AbortSignal | undefined) => Promise<void>
  readonly chunk: (signal: AbortSignal | undefined) => Promise<void>
  readonly chunks: (text: string) => readonly string[]
  readonly setSpeed: (speed: number) => void
}

const BEAT_MS = 450

const CHARS_PER_CHUNK = 6

const CHUNK_MS = 28

function held(hold: Hold, milliseconds: () => number) {
  return async (signal: AbortSignal | undefined): Promise<void> => {
    await hold.wait(signal)
    await pause(milliseconds(), signal)
    await hold.wait(signal)
  }
}

export function createPace(reducedMotion: boolean, hold: Hold): Pace {
  if (reducedMotion) return {beat: hold.wait, chunk: hold.wait, chunks: (text) => [text], setSpeed: () => undefined}
  const state = {speed: 1}
  return {
    beat: held(hold, () => BEAT_MS / state.speed),
    chunk: held(hold, () => CHUNK_MS / state.speed),
    setSpeed: (speed) => {
      state.speed = speed
    },
    chunks: (text) =>
      Array.from({length: Math.ceil(text.length / CHARS_PER_CHUNK)}, (_, index) =>
        text.slice(index * CHARS_PER_CHUNK, (index + 1) * CHARS_PER_CHUNK),
      ),
  }
}
