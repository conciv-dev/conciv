import {isEqual, uniqBy} from 'es-toolkit'
import {z} from 'zod'
import {subscribeRpcReachability} from '@conciv/contract'
import type {ConcivClient} from '@conciv/plugin'
import {
  pluginEnabled,
  pluginIdAvailable,
  shipsPluginExperimental,
  type BridgePluginExperimental,
  type BridgePluginExperimentals,
  type EnableState,
  type Installed,
} from '@conciv/plugin/experimental/host'
import {builtins} from './builtins'
import {createHostState, isCurrentHostWatch, transitionHost, type HostCommand, type HostEvent} from './host-machine'
import {createManager, pluginError} from './manager'
import type {PluginExperimentalSource} from './plugins'
import type {InstalledSource} from './startup'

const text = (maximum: number) => z.string().min(1).max(maximum)

const id = text(256)

const PluginExperimentalSchema = z.object({
  id,
  revision: text(256),
  code: z.string(),
  options: z.record(z.string(), z.json()),
})

const ReservedSchema = z.array(id)

type Parts = {
  readonly server: ReadonlySet<string>
  readonly unreadable: ReadonlyMap<string, string>
}

type Listing = {
  readonly plugins: ReadonlyMap<string, BridgePluginExperimental>
  readonly reserved: readonly string[]
  readonly parts: Parts
}

type Resources = {
  unfollow?: () => void
  watch?: AbortController
  watchTimer?: ReturnType<typeof setTimeout>
  list?: AbortController
  listTimer?: ReturnType<typeof setTimeout>
}

type PluginExperimentalsMessage = Parameters<Parameters<PluginExperimentalSource['on']>[0]>[0]

type InstalledMessage = Parameters<Parameters<InstalledSource['on']>[0]>[0]

export type PluginManager = InstalledSource & {
  readonly enable: (id: string) => Promise<void>
  readonly disable: (id: string) => Promise<void>
  readonly reload: (id: string) => Promise<void>
}

export type BundleSource = PluginExperimentalSource & {
  readonly manager: PluginManager
  readonly onPluginListChange: (listener: () => void) => () => void
  readonly dispose: () => void
}

export function createBundleSource(input: {readonly client: ConcivClient; readonly apiBase: string}): BundleSource {
  const endpoint = {url: input.apiBase, authorization: undefined}
  const local = builtins.map((definition) => definition.id)
  const enableStore = createManager(input.client, local)
  const plugins = new Map<string, BridgePluginExperimental>()
  const inventory: {reserved: readonly string[]; server: ReadonlySet<string>; unreadable: ReadonlyMap<string, string>} =
    {reserved: [], server: new Set(), unreadable: new Map()}
  const enableState: {rows: readonly EnableState[] | undefined} = {rows: undefined}
  const listeners = new Set<(message: PluginExperimentalsMessage) => void>()
  const installedListeners = new Set<(message: InstalledMessage) => void>()
  const pluginListListeners = new Set<() => void>()
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

    if (!controller.signal.aborted && isCurrentHostWatch(machine.following, attempt))
      await readEvents(input.client, attempt, controller.signal).catch(() => undefined)

    if (!controller.signal.aborted) dispatch({type: 'watch.ended', attempt, quitting: false})
  }

  const readEvents = async (client: ConcivClient, attempt: number, signal: AbortSignal) => {
    for await (const event of client.event.subscribe({signal}))
      if (event.type === 'plugin.updated' || event.type === 'server.connected') {
        pluginListListeners.forEach((listener) => listener())
        dispatch({type: 'relist.requested', watchAttempt: attempt, quitting: false})
      }
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
    const listed = (await input.client.plugin.list(undefined, {signal})).data

    const shipped = listed.filter(shipsPluginExperimental)
    const reserved = ReservedSchema.parse(
      shipped.flatMap((plugin) => (pluginIdAvailable(plugin.id, builtins) ? [] : [plugin.id])),
    )

    const parts = {
      server: new Set(shipped.flatMap((plugin) => (plugin.features.server ? [plugin.id] : []))),
      unreadable: new Map<string, string>(),
    }

    const read = await Promise.all(
      shipped
        .filter((plugin) => !reserved.includes(plugin.id))
        .map((plugin) => readPlugin(plugin.id, parts.unreadable, signal)),
    )

    return {plugins: new Map(read.flatMap((entry) => (entry ? [entry] : []))), reserved, parts}
  }

  const readPlugin = async (pluginId: string, unreadable: Map<string, string>, signal: AbortSignal) => {
    const previous = plugins.get(pluginId)

    const bundle = await input.client.plugin
      .experimental({id: pluginId}, {signal})
      .then((result) => PluginExperimentalSchema.parse({id: pluginId, ...result.data}))
      .then(
        (value) => value,
        (cause: unknown) => {
          if (signal.aborted) return
          console.error('[plugin] plugin bundle read failed', pluginId, cause)

          if (!previous) unreadable.set(pluginId, cause instanceof Error ? cause.message : String(cause))
        },
      )

    if (!bundle) return previous && ([pluginId, previous] as const)

    if (previous?.revision === bundle.revision) return [pluginId, previous] as const

    return [pluginId, bundle] as const
  }

  const applyPlugins = (next: Listing) => {
    const removed = [...plugins.keys()].filter((pluginId) => !next.plugins.has(pluginId))

    const changes = [...next.plugins].filter(([pluginId, plugin]) => plugins.get(pluginId) !== plugin)

    if (
      removed.length === 0 &&
      changes.length === 0 &&
      next.reserved.join('\n') === inventory.reserved.join('\n') &&
      [...next.parts.server].join('\n') === [...inventory.server].join('\n') &&
      [...next.parts.unreadable].join('\n') === [...inventory.unreadable].join('\n')
    )
      return
    removed.forEach((pluginId) => plugins.delete(pluginId))
    changes.forEach(([pluginId, plugin]) => plugins.set(pluginId, plugin))
    inventory.reserved = next.reserved
    inventory.server = next.parts.server
    inventory.unreadable = next.parts.unreadable
    changed()
    const message: PluginExperimentalsMessage = {type: 'pluginExperimentals', ...pluginExperimentals()}
    listeners.forEach((listener) => listener(message))
  }

  const pluginExperimentals = (): BridgePluginExperimentals => ({
    plugins: [...plugins.values()],
    reserved: inventory.reserved,
  })

  const enabled = (pluginId: string) =>
    pluginEnabled({id: pluginId, builtin: local.includes(pluginId)}, enableState.rows ?? [])

  const known = (pluginId: string) => local.includes(pluginId) || plugins.has(pluginId)

  const installed = (): readonly Installed[] => [
    ...local.map((pluginId) => ({id: pluginId, builtin: true, enabled: enabled(pluginId)})),

    ...[...plugins.keys()].map((pluginId) => ({
      id: pluginId,
      builtin: false,
      enabled: enabled(pluginId),
      server: inventory.server.has(pluginId),
    })),

    ...[...inventory.unreadable].map(([pluginId, error]) => ({
      id: pluginId,
      builtin: false,
      enabled: enabled(pluginId),
      server: inventory.server.has(pluginId),
      error,
    })),
  ]

  const changed = () => {
    if (enableState.rows === undefined) return

    const message: InstalledMessage = {type: 'installed', list: installed()}
    installedListeners.forEach((listener) => listener(message))
  }

  const settle = (rows: readonly EnableState[]) => {
    const before = enableState.rows === undefined ? [] : installed()
    enableState.rows = rows

    if (!isEqual(before, installed())) changed()
  }

  const loaded = Promise.withResolvers<readonly EnableState[]>()

  loaded.promise.catch(() => undefined)

  const unfollowEnableState = enableStore.on(
    (rows) => {
      settle(rows)
      loaded.resolve(rows)
    },
    (cause) => loaded.reject(cause),
  )

  const setEnabled = async (pluginId: string, value: boolean) => {
    if (!known(pluginId)) throw pluginError('notFound')

    await loaded.promise
    const previous = enableState.rows
    enableState.rows = uniqBy([{id: pluginId, enabled: value}, ...(previous ?? [])], (row) => row.id)
    changed()

    await enableStore.setEnabled(pluginId, value).catch((cause: unknown) => {
      enableState.rows = previous
      changed()
      throw cause
    })
  }

  dispatch({type: 'started', endpoint, quitting: false})

  return {
    pluginExperimentals: () => Promise.resolve(pluginExperimentals()),
    on(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    onPluginListChange(listener) {
      pluginListListeners.add(listener)

      return () => pluginListListeners.delete(listener)
    },
    manager: {
      initial: loaded.promise,
      list: () => loaded.promise.then(installed),
      on(listener) {
        installedListeners.add(listener)

        return () => installedListeners.delete(listener)
      },
      enable: (pluginId) => setEnabled(pluginId, true),
      disable: (pluginId) => setEnabled(pluginId, false),
      async reload(pluginId) {
        if (!known(pluginId)) throw pluginError('notFound')

        changed()
      },
    },
    dispose: () => {
      unfollowEnableState()
      loaded.reject(new Error('the plugin manager was disposed'))
      dispatch({type: 'stopped'})
    },
  }
}
