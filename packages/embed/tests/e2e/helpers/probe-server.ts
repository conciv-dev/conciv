import {os} from '@orpc/server'
import {z} from 'zod'
import {serveRpcRouter, type ServedRpcRouter} from '@conciv/harness-testkit/rpc-mounts'

type Signal = {arrived: Promise<void>; markArrived: () => void; open: Promise<void>; release: () => void}

function makeSignal(): Signal {
  const signal: Signal = {
    arrived: Promise.resolve(),
    markArrived: () => {},
    open: Promise.resolve(),
    release: () => {},
  }
  signal.arrived = new Promise<void>((resolve) => {
    signal.markArrived = resolve
  })
  signal.open = new Promise<void>((resolve) => {
    signal.release = resolve
  })
  return signal
}

function makeGate(): {
  entered: (index: number) => Promise<void>
  enter: () => Promise<void>
  release: () => void
} {
  const signals: Signal[] = []
  const signalAt = (index: number): Signal => {
    while (signals.length <= index) signals.push(makeSignal())
    const signal = signals[index]
    if (!signal) throw new Error(`the probe gate lost signal ${index}`)
    return signal
  }
  const state = {entered: 0, released: false}
  return {
    entered: (index) => signalAt(index).arrived,
    enter: async () => {
      const signal = signalAt(state.entered)
      state.entered += 1
      signal.markArrived()
      if (state.released) return
      await signal.open
    },
    release: () => {
      state.released = true
      for (const signal of signals) signal.release()
    },
  }
}

export type ProbeServer = ServedRpcRouter & {
  slowEntered: (index: number) => Promise<void>
  releaseSlow: () => void
  navigationEntered: (index: number) => Promise<void>
  releaseNavigation: () => void
  navigationWrites: () => readonly string[]
}

const NavigationInput = z.object({
  entries: z.array(z.object({href: z.string()})),
  index: z.number(),
  updatedAt: z.number(),
})

export async function startProbeServer(): Promise<ProbeServer> {
  const slow = makeGate()
  const navigation = makeGate()
  const writes: string[] = []
  const router = {
    slow: os.input(z.object({tag: z.string()})).handler(async ({input}) => {
      await slow.enter()
      return {tag: input.tag}
    }),
    fast: os.handler(() => ({ok: true})),
    navigation: {
      set: os.input(NavigationInput).handler(async ({input}) => {
        writes.push(input.entries[0]?.href ?? '')
        await navigation.enter()
        return {ok: true, applied: true}
      }),
    },
  }
  const served = await serveRpcRouter({router})
  return {
    ...served,
    slowEntered: slow.entered,
    releaseSlow: slow.release,
    navigationEntered: navigation.entered,
    releaseNavigation: navigation.release,
    navigationWrites: () => writes,
  }
}
