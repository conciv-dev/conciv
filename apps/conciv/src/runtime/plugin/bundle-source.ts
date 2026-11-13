import {z} from 'zod'
import {subscribeRpcReachability, type RpcClient} from '@conciv/contract'
import {
  pluginIdAvailable,
  shipsPluginExperimental,
  type BridgePluginExperimental,
  type BridgePluginExperimentals,
} from '@conciv/plugin/experimental/host'
import {builtins} from './builtins'
import {createHostState, isCurrentHostWatch, transitionHost, type HostCommand, type HostEvent} from './host-machine'
import type {PluginExperimentalSource} from './plugins'

const text = (maximum: number) => z.string().min(1).max(maximum)

const id = text(256)

const PluginExperimentalSchema = z.object({
  id,
  revision: text(256),
  code: z.string(),
  options: z.record(z.string(), z.json()),
})

const ReservedSchema = z.array(id)

type Listing = {
  readonly plugins: ReadonlyMap<string, BridgePluginExperimental>
  readonly reserved: readonly string[]
}

type Resources = {
  unfollow?: () => void
  watch?: AbortController
  watchTimer?: ReturnType<typeof setTimeout>
  list?: AbortController
  listTimer?: ReturnType<typeof setTimeout>
}

type PluginExperimentalsMessage = Parameters<Parameters<PluginExperimentalSource['on']>[0]>[0]

export type BundleSource = PluginExperimentalSource & {readonly dispose: () => void}

export function createBundleSource(input: {readonly rpc: RpcClient; readonly apiBase: string}): BundleSource {
  const endpoint = {url: input.apiBase, authorization: undefined}
  const plugins = new Map<string, BridgePluginExperimental>()
  const inventory: {reserved: readonly string[]} = {reserved: []}
  const listeners = new Set<(message: PluginExperimentalsMessage) => void>()
  const resources: Resources = {}
  const machine = {following: createHostState()}

  const dispatch = (event: HostEvent<Listing>) => {
    const next = transitionHost(machine.following, event)
    machine.following = next.state
    next.commands.forEach((command) =>
      Promise.try(() => perform(command)).catch((cause: unknown) =>
        console.error('[plugin] plugin host command failed', command.type, cause),
      ),
    )
  }

  const perform = (command: HostCommand<Listing>) => {
    switch (command.type) {
      case 'subscribe-credentials':
        resources.unfollow = subscribeRpcReachability(input.apiBase, (reachable) =>
          dispatch({type: 'endpoint.changed', endpoint: reachable ? endpoint : undefined, quitting: false}),
        )

        return
      case 'unsubscribe-credentials':
        resources.unfollow?.()
        resources.unfollow = undefined

        return
      case 'start-watch':
        return void watchPlugins(command.attempt)
      case 'schedule-watch-retry':
        clearTimeout(resources.watchTimer)
        resources.watchTimer = setTimeout(
          () => dispatch({type: 'watch.retry-due', attempt: command.attempt, quitting: false}),
          command.delayMs,
        )

        return
      case 'cancel-watch':
        resources.watch?.abort()
        resources.watch = undefined
        clearTimeout(resources.watchTimer)
        resources.watchTimer = undefined

        return
      case 'start-list':
        return void listPlugins(command.attempt, command.timeoutMs)
      case 'cancel-list':
        resources.list?.abort()
        resources.list = undefined
        clearTimeout(resources.listTimer)
        resources.listTimer = undefined

        return
      case 'apply-listing':
        return applyPlugins(command.listing)
      case 'log-list-error':
        return console.error('[plugin] plugin listing failed', command.cause)
    }
  }

  const watchPlugins = async (attempt: number) => {
    resources.watch?.abort()
    const controller = new AbortController()
    resources.watch = controller

    await readChanges(attempt, controller.signal).catch(() => undefined)

    if (!controller.signal.aborted) dispatch({type: 'watch.ended', attempt, quitting: false})
  }

  const readChanges = async (attempt: number, signal: AbortSignal) => {
    const changes = await input.rpc.plugin.changes(undefined, {signal})

    if (signal.aborted || !isCurrentHostWatch(machine.following, attempt)) return
    dispatch({type: 'relist.requested', watchAttempt: attempt, quitting: false})

    for await (const _ of changes) dispatch({type: 'relist.requested', watchAttempt: attempt, quitting: false})
  }

  const listPlugins = async (attempt: number, timeoutMs: number) => {
    resources.list?.abort()
    clearTimeout(resources.listTimer)
    const controller = new AbortController()
    resources.list = controller
    resources.listTimer = setTimeout(() => dispatch({type: 'list.timed-out', attempt, quitting: false}), timeoutMs)

    const event = await readListing(controller.signal).then(
      (listing): HostEvent<Listing> => ({type: 'list.succeeded', attempt, listing, quitting: false}),
      (cause: unknown): HostEvent<Listing> => ({type: 'list.failed', attempt, cause, quitting: false}),
    )

    if (controller.signal.aborted) return
    clearTimeout(resources.listTimer)
    resources.list = undefined
    resources.listTimer = undefined
    dispatch(event)
  }

  const readListing = async (signal: AbortSignal): Promise<Listing> => {
    const listed = (await input.rpc.plugin.list(undefined, {signal})).data

    const shipped = listed.filter(shipsPluginExperimental)
    const reserved = ReservedSchema.parse(
      shipped.flatMap((plugin) => (pluginIdAvailable(plugin.id, builtins) ? [] : [plugin.id])),
    )

    const read = await Promise.all(
      shipped.filter((plugin) => !reserved.includes(plugin.id)).map((plugin) => readPlugin(plugin.id, signal)),
    )

    return {plugins: new Map(read.flatMap((entry) => (entry ? [entry] : []))), reserved}
  }

  const readPlugin = async (pluginId: string, signal: AbortSignal) => {
    const previous = plugins.get(pluginId)

    const bundle = await input.rpc.plugin
      .experimental({id: pluginId}, {signal})
      .then((result) => PluginExperimentalSchema.parse({id: pluginId, ...result.data}))
      .then(
        (value) => value,
        (cause: unknown) => {
          if (signal.aborted) return
          console.error('[plugin] plugin bundle read failed', pluginId, cause)
        },
      )

    if (!bundle) return previous && ([pluginId, previous] as const)

    if (previous?.revision === bundle.revision) return [pluginId, previous] as const

    return [pluginId, bundle] as const
  }

  const applyPlugins = (next: Listing) => {
    const removed = [...plugins.keys()].filter((pluginId) => !next.plugins.has(pluginId))

    const changes = [...next.plugins].filter(([pluginId, plugin]) => plugins.get(pluginId) !== plugin)

    if (removed.length === 0 && changes.length === 0 && next.reserved.join('\n') === inventory.reserved.join('\n'))
      return
    removed.forEach((pluginId) => plugins.delete(pluginId))
    changes.forEach(([pluginId, plugin]) => plugins.set(pluginId, plugin))
    inventory.reserved = next.reserved
    const message: PluginExperimentalsMessage = {type: 'pluginExperimentals', ...pluginExperimentals()}
    listeners.forEach((listener) => listener(message))
  }

  const pluginExperimentals = (): BridgePluginExperimentals => ({
    plugins: [...plugins.values()],
    reserved: inventory.reserved,
  })

  dispatch({type: 'started', endpoint, quitting: false})

  return {
    pluginExperimentals: () => Promise.resolve(pluginExperimentals()),
    on(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    dispose: () => dispatch({type: 'stopped'}),
  }
}
