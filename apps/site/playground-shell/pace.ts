function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      {once: true},
    )
  })
}

export function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), {once: true}))
}

export type Hold = {
  readonly hold: () => void
  readonly resume: () => void
  readonly wait: (signal: AbortSignal) => Promise<void>
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
  readonly beat: (signal: AbortSignal) => Promise<void>
  readonly setSpeed: (speed: number) => void
}

const BEAT_MS = 450

export function createPace(reducedMotion: boolean, hold: Hold): Pace {
  if (reducedMotion) return {beat: hold.wait, setSpeed: () => undefined}
  const state = {speed: 1}
  return {
    beat: async (signal) => {
      await hold.wait(signal)
      await pause(BEAT_MS / state.speed, signal)
      await hold.wait(signal)
    },
    setSpeed: (speed) => {
      state.speed = speed
    },
  }
}
