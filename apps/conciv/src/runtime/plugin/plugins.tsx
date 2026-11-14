import {onCleanup, untrack} from 'solid-js'
import type {PluginOptions} from '@conciv/plugin/experimental'
import type {BridgePluginExperimental, BridgePluginExperimentals, Entry} from '@conciv/plugin/experimental/host'
import type {ConcivClient} from '@conciv/plugin'
import {pluginDefinition} from './module'
import {
  createPluginExperimentalState,
  PLUGIN_EXPERIMENTAL_INITIAL_TIMEOUT_MS,
  transitionPluginExperimental,
  type LoadedPluginExperimental,
  type PluginExperimentalEffect,
  type PluginExperimentalEvent,
} from './plugin-experimental-machine'

export type PluginExperimentalSource = {
  readonly pluginExperimentals: () => Promise<BridgePluginExperimentals>
  readonly on: (
    listener: (message: {readonly type: 'pluginExperimentals'} & BridgePluginExperimentals) => void,
  ) => () => void
}

export type PluginExperimental = {
  readonly definition: Entry
  readonly options: PluginOptions
  readonly client: () => ConcivClient | undefined
}

export function PluginExperimentalLoader(props: {
  source: PluginExperimentalSource
  client: () => ConcivClient | undefined
  onChange: (plugins: readonly PluginExperimental[], reserved: readonly string[]) => void
}) {
  const client = () => props.client()
  const initial = createPluginExperimentalState()
  const machine = {state: initial.state}
  const queue: PluginExperimentalEvent[] = []
  let timer: ReturnType<typeof setTimeout> | undefined

  const dispatch = (event: PluginExperimentalEvent) => {
    queue.push(event)

    if (queue.length === 1) untrack(drain)
  }

  const drain = () => {
    const event = queue[0]

    if (!event) return

    try {
      const next = transitionPluginExperimental(machine.state, event)

      machine.state = next.state
      next.effects.forEach((effect) =>
        Promise.try(() => run(effect)).catch((cause: unknown) =>
          console.error('[plugin] plugin experimental effect failed', cause),
        ),
      )
    } finally {
      queue.shift()
    }

    drain()
  }

  const run = (effect: PluginExperimentalEffect) => {
    if (effect.type === 'fetch.initial')
      return void Promise.try(() => props.source.pluginExperimentals()).then(
        (experimentals) => dispatch({type: 'initial.resolved', attempt: effect.attempt, experimentals}),
        (cause: unknown) => dispatch({type: 'initial.failed', attempt: effect.attempt, cause}),
      )

    if (effect.type === 'timer.start') {
      clearTimeout(timer)
      timer = setTimeout(
        () => dispatch({type: 'timeout', attempt: effect.attempt}),
        PLUGIN_EXPERIMENTAL_INITIAL_TIMEOUT_MS,
      )

      return
    }

    if (effect.type === 'timer.stop') {
      clearTimeout(timer)
      timer = undefined

      return
    }

    if (effect.type === 'evaluate')
      return void Promise.all(effect.plugins.map(evaluate)).then(
        (loaded) => dispatch({type: 'evaluated', attempt: effect.attempt, loaded}),
        (cause: unknown) => dispatch({type: 'evaluate.failed', attempt: effect.attempt, cause}),
      )

    if (effect.type === 'publish')
      return props.onChange(
        effect.plugins.map((plugin) => ({definition: plugin.definition, options: plugin.options, client})),
        effect.reserved,
      )

    console.error('[plugin] failed to load plugin experimentals', effect.cause)
  }

  onCleanup(
    props.source.on((message) => {
      if (message.type === 'pluginExperimentals')
        dispatch({type: 'pushed', experimentals: {plugins: message.plugins, reserved: message.reserved}})
    }),
  )
  onCleanup(() => dispatch({type: 'disposed'}))
  initial.effects.forEach(run)

  return null
}

async function evaluate(plugin: BridgePluginExperimental): Promise<LoadedPluginExperimental> {
  return {
    id: plugin.id,
    revision: plugin.revision,
    options: plugin.options,
    definition: await pluginDefinition(plugin.id, plugin.code),
  }
}
