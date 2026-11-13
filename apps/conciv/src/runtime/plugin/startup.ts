import {createSignal, onCleanup, untrack} from 'solid-js'
import type {EnableState, Installed} from '@conciv/plugin/experimental/host'
import {
  createStartupGateState,
  transitionStartupGate,
  type StartupGateEffect,
  type StartupGateEvent,
  type StartupGateTimer,
} from './machine'

export type InstalledSource = {
  readonly initial?: Promise<readonly EnableState[] | undefined>
  readonly list: () => Promise<readonly Installed[]>
  readonly on: (
    listener: (message: {readonly type: 'installed'; readonly list: readonly Installed[]}) => void,
  ) => () => void
}

const timeouts: Record<StartupGateTimer, number> = {preferences: 5_000, activation: 10_000, servers: 20_000}

export function createStartupGate(input: {
  readonly installed: InstalledSource | undefined
  readonly plugins: readonly string[]
  readonly servers: boolean
}) {
  const installed = input.installed

  const initial = createStartupGateState({
    bridge: !!installed,
    preload: !!installed?.initial,
    plugins: input.plugins,
    servers: input.servers,
  })

  const [state, setState] = createSignal(initial.state)
  const lifetime = {disposed: false}
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const queue: StartupGateEvent[] = []

  const drain = () => {
    const event = queue[0]

    if (!event) return

    const next = transitionStartupGate(untrack(state), event)

    setState(next.state)
    next.effects.forEach(run)
    queue.shift()
    drain()
  }

  const dispatch = (event: StartupGateEvent) => {
    if (lifetime.disposed) return

    queue.push(event)

    if (queue.length === 1) drain()
  }

  const run = (effect: StartupGateEffect) => {
    if (effect.type === 'preload.read')
      return void installed?.initial?.then(
        (rows) => dispatch(rows ? {type: 'preload.resolved', rows} : {type: 'preload.unavailable'}),
        () => dispatch({type: 'preload.unavailable'}),
      )

    if (effect.type === 'list.fetch')
      return void new Promise<readonly Installed[]>((resolve) => resolve(installed?.list() ?? [])).then(
        (list) => dispatch({type: 'list.resolved', list}),
        (cause: unknown) => {
          console.error('[plugin] failed to load installed plugin list', cause)
          dispatch({type: 'list.failed', error: cause instanceof Error ? cause.message : String(cause)})
        },
      )

    stopTimers()

    if (effect.type === 'timer.start')
      timers.add(setTimeout(() => dispatch({type: 'timeout', timer: effect.timer}), timeouts[effect.timer]))
  }

  const stopTimers = () => {
    timers.forEach(clearTimeout)
    timers.clear()
  }

  if (installed)
    onCleanup(
      installed.on((message) => {
        if (message.type === 'installed') dispatch({type: 'installed.pushed', list: message.list})
      }),
    )

  onCleanup(() => {
    lifetime.disposed = true
    stopTimers()
    queue.length = 0
  })

  initial.effects.forEach(run)

  return {state, dispatch}
}
