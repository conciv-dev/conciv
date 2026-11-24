import {isEqual, uniqBy} from 'es-toolkit'
import {observable, untrack, type Accessor} from 'solid-js'
import {z} from 'zod'
import {
  Cause,
  Context,
  Deferred,
  Duration,
  Effect,
  Fiber,
  FiberSet,
  FiberHandle,
  Layer,
  ManagedRuntime,
  Match,
  Option,
  PubSub,
  Queue,
  Ref,
  Schema,
  Scope,
  Semaphore,
  Stream,
} from 'effect'
import {subscribeRpcReachability, type EngineConnectionTimings} from '@conciv/contract'
import type {ConcivClient} from '@conciv/plugin'
import type {PluginOptions} from '@conciv/plugin/experimental'
import {
  pluginEnabled,
  pluginIdAvailable,
  shipsPluginExperimental,
  type BridgePluginExperimental,
  type BridgePluginExperimentals,
  type EnableState,
  type Entry,
  type Installed,
} from '@conciv/plugin/experimental/host'
import {
  createHostState,
  isCurrentHostWatch,
  transitionHost,
  type HostCommand,
  type HostEndpoint,
  type HostEvent,
} from './host-machine'
import {builtins} from './builtins'
import {pluginError} from './error'
import {createManager} from './manager'
import type {PluginExperimentalSource} from './plugins'
import type {InstalledSource} from './startup'

const text = (maximum: number) => z.string().min(1).max(maximum)

const id = text(256)

const PluginExperimentalSchema = z.object({
  id,
  revision: text(256),
  file: text(256),
  code: z.string(),
  options: z.record(z.string(), z.json()),
  chunks: z.array(z.object({file: text(256), code: z.string()})),
})

const ReservedSchema = z.array(id)

const PluginSourceClosed = Schema.TaggedStruct('PluginSourceClosed', {message: Schema.String})

type PluginSourceClosed = typeof PluginSourceClosed.Type

type Parts = {
  readonly server: ReadonlySet<string>
  readonly unreadable: ReadonlyMap<string, string>
}

type Listing = {
  readonly plugins: ReadonlyMap<string, BridgePluginExperimental>
  readonly reserved: readonly string[]
  readonly parts: Parts
  readonly builtinOptions: ReadonlyMap<string, PluginOptions>
  readonly builtinsListed: ReadonlySet<string>
}

type PluginExperimentalsMessage = Parameters<Parameters<PluginExperimentalSource['on']>[0]>[0]

type InstalledMessage = Parameters<Parameters<InstalledSource['on']>[0]>[0]

type BundleSignal =
  | PluginExperimentalsMessage
  | InstalledMessage
  | {readonly type: 'plugin-list-changed'}
  | {readonly type: 'sessions-changed'; readonly sessionId: string | undefined}

type ListedPlugin = Parameters<typeof shipsPluginExperimental>[0]

const BuiltinOptionsSchema = z.record(z.string(), z.json())

const ENGINE_HALVES: ReadonlySet<string> = new Set(builtins.flatMap((entry) => (entry.engineHalf ? [entry.id] : [])))

type BundleData = Awaited<ReturnType<ConcivClient['plugin']['experimental']>>['data']

type EngineEvent = ReturnType<ConcivClient['event']['subscribe']> extends AsyncIterable<infer Event> ? Event : never

export type EngineSignal =
  | {readonly type: 'session.changed'; readonly sessionId: string}
  | {readonly type: 'server.connected'}
  | {readonly type: 'plugin.updated'}

export type PluginEngineShape = {
  readonly reachability: (url: string) => Effect.Effect<Stream.Stream<boolean>, never, Scope.Scope>
  readonly events: Stream.Stream<EngineSignal, unknown>
  readonly list: Effect.Effect<readonly ListedPlugin[], unknown>
  readonly bundle: (pluginId: string) => Effect.Effect<BundleData, unknown>
  readonly enableState: Stream.Stream<readonly EnableState[], unknown>
  readonly setEnabled: (pluginId: string, enabled: boolean) => Effect.Effect<void, unknown>
}

export const PluginEngine = Context.Service<PluginEngineShape>('@conciv/app/PluginEngine')

type BundleDriverShape = {
  readonly following: Effect.Effect<boolean>
  readonly pluginExperimentals: Effect.Effect<BridgePluginExperimentals, PluginSourceClosed>
  readonly enableLoaded: Effect.Effect<readonly EnableState[], unknown>
  readonly installed: Effect.Effect<readonly Installed[]>
  readonly builtinOptions: (pluginId: string) => PluginOptions | undefined
  readonly listen: (handle: (signal: BundleSignal) => void) => Effect.Effect<Fiber.Fiber<void>>
  readonly setEnabled: (pluginId: string, value: boolean) => Effect.Effect<void, unknown>
  readonly reload: (pluginId: string) => Effect.Effect<void, unknown>
  readonly stop: Effect.Effect<void>
}

const BundleDriver = Context.Service<BundleDriverShape>('@conciv/app/BundleDriver')

export type PluginManager = InstalledSource & {
  readonly enable: (id: string) => Promise<void>
  readonly disable: (id: string) => Promise<void>
  readonly reload: (id: string) => Promise<void>
}

export type BundleSource = PluginExperimentalSource & {
  readonly manager: PluginManager
  readonly onPluginListChange: (listener: () => void) => () => void
  readonly onSessionsChanged: (listener: (sessionId: string | undefined) => void) => () => void
  readonly builtinOptions: (pluginId: string) => PluginOptions | undefined
  readonly dispose: () => void
}

function endpointFor(url: string): HostEndpoint | undefined {
  return url === '' ? undefined : {url, authorization: undefined}
}

function readEngineSignal(event: EngineEvent): readonly EngineSignal[] {
  if (event.type === 'session.deleted' || event.type === 'session.renamed')
    return [{type: 'session.changed', sessionId: event.data.sessionID}]
  if (event.type === 'server.connected' || event.type === 'plugin.updated') return [{type: event.type}]

  return []
}

function callbackStream<A>(subscribe: (emit: (value: A) => void, fail: (cause: unknown) => void) => () => void) {
  return Stream.callback<A, unknown>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        subscribe(
          (value) => Queue.offerUnsafe(queue, value),
          (cause) => Queue.failCauseUnsafe(queue, Cause.fail(cause)),
        ),
      ),
      (unsubscribe) => Effect.sync(unsubscribe),
    ),
  )
}

function livePluginEngine(
  client: ConcivClient,
  builtins: readonly string[],
  engineTimings: Partial<EngineConnectionTimings> | undefined,
) {
  const enableStore = createManager(client, builtins)

  return Layer.succeed(PluginEngine, {
    reachability: (url) =>
      Effect.gen(function* () {
        const votes = yield* Queue.unbounded<boolean>()
        yield* Effect.acquireRelease(
          Effect.sync(() =>
            subscribeRpcReachability(url, (reachable) => Queue.offerUnsafe(votes, reachable), engineTimings),
          ),
          (unsubscribe) => Effect.sync(unsubscribe),
        )

        return Stream.fromQueue(votes)
      }),
    events: Stream.suspend(() => Stream.fromAsyncIterable(client.event.subscribe(), (cause) => cause)).pipe(
      Stream.map(readEngineSignal),
      Stream.flattenIterable,
    ),
    list: Effect.tryPromise({
      try: (signal) => client.plugin.list(undefined, {signal}).then((result) => result.data),
      catch: (cause) => cause,
    }),
    bundle: (pluginId) =>
      Effect.tryPromise({
        try: (signal) => client.plugin.experimental({id: pluginId}, {signal}).then((result) => result.data),
        catch: (cause) => cause,
      }),
    enableState: callbackStream<readonly EnableState[]>((emit, fail) => enableStore.on(emit, fail)),
    setEnabled: (pluginId, enabled) =>
      Effect.tryPromise({try: () => enableStore.setEnabled(pluginId, enabled), catch: (cause) => cause}),
  })
}

export const makeBundleSource = Effect.fn('BundleSource.make')(function* (input: {
  readonly address: string
  readonly addresses: Stream.Stream<string>
  readonly builtins: readonly Entry[]
}) {
  const engine = yield* PluginEngine
  const local = input.builtins.map((definition) => definition.id)
  const plugins = new Map<string, BridgePluginExperimental>()
  const inventory: {
    reserved: readonly string[]
    server: ReadonlySet<string>
    unreadable: ReadonlyMap<string, string>
    builtinOptions: ReadonlyMap<string, PluginOptions>
    builtinsListed: ReadonlySet<string> | undefined
  } = {reserved: [], server: new Set(), unreadable: new Map(), builtinOptions: new Map(), builtinsListed: undefined}
  const enableState: {rows: readonly EnableState[] | undefined} = {rows: undefined}
  const machine = yield* Ref.make(createHostState())
  const signals = yield* PubSub.unbounded<BundleSignal>()
  const transitions = yield* Semaphore.make(1)
  const credentials = yield* FiberHandle.make<void, never>()
  const watch = yield* FiberHandle.make<void, never>()
  const watchRetry = yield* FiberHandle.make<void, never>()
  const enableFollow = yield* FiberHandle.make<void, never>()
  const listFiber = yield* FiberHandle.make<void, never>()
  const reports = yield* FiberSet.make<void, never>()
  const listeners = yield* FiberSet.make<void, never>()
  const firstListing = yield* Deferred.make<void, PluginSourceClosed>()
  const loaded = yield* Deferred.make<readonly EnableState[], unknown>()
  const followed = () => {
    const state = Ref.getUnsafe(machine)

    return state.status === 'following' ? state.endpoint : undefined
  }

  const start = (handle: FiberHandle.FiberHandle<void, never>, effect: Effect.Effect<void>) =>
    FiberHandle.run(handle, effect).pipe(Effect.asVoid)

  const dispatch = (event: HostEvent<Listing>): Effect.Effect<void> =>
    transitions.withPermits(1)(
      Effect.gen(function* () {
        const next = transitionHost(yield* Ref.get(machine), event)
        yield* Ref.set(machine, next.state)
        yield* Effect.forEach(next.commands, perform, {discard: true})
      }),
    )

  const perform = (command: HostCommand<Listing>): Effect.Effect<void> =>
    Match.value(command).pipe(
      Match.discriminatorsExhaustive('type')({
        'subscribe-credentials': () => start(credentials, followEndpoint),
        'unsubscribe-credentials': () => FiberHandle.clear(credentials),
        'start-watch': (watching) =>
          Effect.andThen(start(enableFollow, followEnableState), start(watch, watchPlugins(watching.attempt))),
        'schedule-watch-retry': (retry) =>
          start(
            watchRetry,
            Effect.andThen(
              Effect.sleep(Duration.millis(retry.delayMs)),
              dispatch({type: 'watch.retry-due', attempt: retry.attempt, quitting: false}),
            ),
          ),
        'cancel-watch': () =>
          Effect.all([FiberHandle.clear(enableFollow), FiberHandle.clear(watch), FiberHandle.clear(watchRetry)], {
            discard: true,
          }),
        'start-list': (requested) => start(listFiber, listPlugins(requested.attempt, requested.timeoutMs)),
        'cancel-list': () => FiberHandle.clear(listFiber),
        'apply-listing': (applied) => Effect.andThen(applyPlugins(applied.listing), firstListed),
        'log-list-error': (failed) =>
          Effect.andThen(Effect.logError('[plugin] plugin listing failed', failed.cause), firstListed),
      }),
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterrupts(cause),
        (cause) => Effect.logError('[plugin] plugin host command failed', command.type, cause),
      ),
    )

  const followEndpoint: Effect.Effect<void> = input.addresses.pipe(
    Stream.switchMap((url) =>
      url === ''
        ? Stream.make({url, reachable: Option.none<boolean>()})
        : Stream.unwrap(
            Effect.map(engine.reachability(url), (votes) =>
              Stream.concat(
                Stream.make({url, reachable: Option.none<boolean>()}),
                Stream.map(votes, (reachable) => ({url, reachable: Option.some(reachable)})),
              ),
            ),
          ),
    ),
    Stream.runForEach(({url, reachable}) => {
      if (Option.isSome(reachable))
        return dispatch({
          type: 'endpoint.changed',
          endpoint: reachable.value ? endpointFor(url) : undefined,
          quitting: false,
        })

      if (followed()?.url === endpointFor(url)?.url) return Effect.void

      return dispatch({type: 'endpoint.changed', endpoint: endpointFor(url), quitting: false})
    }),
  )

  const followEnableState: Effect.Effect<void> = engine.enableState.pipe(
    Stream.runForEach((rows) => Effect.andThen(settle(rows), Deferred.succeed(loaded, rows))),
    Effect.catch((cause) => Deferred.fail(loaded, cause)),
    Effect.asVoid,
  )

  const onEngineSignal = (signal: EngineSignal, attempt: number): Effect.Effect<void> =>
    Match.value(signal).pipe(
      Match.discriminatorsExhaustive('type')({
        'session.changed': (changed) =>
          PubSub.publish(signals, {type: 'sessions-changed', sessionId: changed.sessionId}).pipe(Effect.asVoid),
        'server.connected': () =>
          PubSub.publish(signals, {type: 'sessions-changed', sessionId: undefined}).pipe(
            Effect.andThen(relist(attempt)),
          ),
        'plugin.updated': () => relist(attempt),
      }),
    )

  const relist = (attempt: number) =>
    PubSub.publish(signals, {type: 'plugin-list-changed'}).pipe(
      Effect.andThen(dispatch({type: 'relist.requested', watchAttempt: attempt, quitting: false})),
    )

  const watchPlugins = (attempt: number): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (isCurrentHostWatch(yield* Ref.get(machine), attempt))
        yield* engine.events.pipe(
          Stream.runForEach((signal) => onEngineSignal(signal, attempt)),
          Effect.ignore,
          Effect.catchDefect(() => Effect.void),
        )

      yield* dispatch({type: 'watch.ended', attempt, quitting: false})
    })

  const listPlugins = (attempt: number, timeoutMs: number): Effect.Effect<void> =>
    readListing.pipe(
      Effect.match({
        onSuccess: (listing): HostEvent<Listing> => ({type: 'list.succeeded', attempt, listing, quitting: false}),
        onFailure: (cause): HostEvent<Listing> => ({type: 'list.failed', attempt, cause, quitting: false}),
      }),
      Effect.timeoutOption(Duration.millis(timeoutMs)),
      Effect.map(Option.getOrElse((): HostEvent<Listing> => ({type: 'list.timed-out', attempt, quitting: false}))),
      Effect.flatMap((event) => FiberSet.run(reports, dispatch(event))),
      Effect.asVoid,
    )

  const readListing: Effect.Effect<Listing, unknown> = Effect.gen(function* () {
    const listed = yield* engine.list
    const shipped = listed.filter(shipsPluginExperimental)
    const builtinOptions = new Map(
      listed.flatMap((plugin) => {
        const options = BuiltinOptionsSchema.safeParse(plugin.options)
        return plugin.id !== undefined && ENGINE_HALVES.has(plugin.id) && options.success
          ? [[plugin.id, options.data] as const]
          : []
      }),
    )
    const reserved = yield* Effect.try({
      try: () =>
        ReservedSchema.parse(
          shipped.flatMap((plugin) => (pluginIdAvailable(plugin.id, input.builtins) ? [] : [plugin.id])),
        ),
      catch: (cause) => cause,
    })

    const parts = {
      server: new Set(shipped.flatMap((plugin) => (plugin.features.server ? [plugin.id] : []))),
      unreadable: new Map<string, string>(),
    }

    const read = yield* Effect.forEach(
      shipped.filter((plugin) => !reserved.includes(plugin.id)),
      (plugin) => readPlugin(plugin.id, parts.unreadable),
      {concurrency: 'unbounded'},
    )

    const builtinsListed = new Set(
      listed.flatMap((plugin) => (plugin.id !== undefined && ENGINE_HALVES.has(plugin.id) ? [plugin.id] : [])),
    )

    return {
      plugins: new Map(read.flatMap((entry) => (entry ? [entry] : []))),
      reserved,
      parts,
      builtinOptions,
      builtinsListed,
    }
  })

  const readPlugin = (pluginId: string, unreadable: Map<string, string>) => {
    const previous = plugins.get(pluginId)

    return engine.bundle(pluginId).pipe(
      Effect.flatMap((data) =>
        Effect.try({try: () => PluginExperimentalSchema.parse({id: pluginId, ...data}), catch: (cause) => cause}),
      ),
      Effect.map((bundle) =>
        previous?.revision === bundle.revision ? ([pluginId, previous] as const) : ([pluginId, bundle] as const),
      ),
      Effect.catch((cause) =>
        Effect.logError('[plugin] plugin bundle read failed', pluginId, cause).pipe(
          Effect.andThen(
            Effect.sync(() => {
              if (!previous) unreadable.set(pluginId, cause instanceof Error ? cause.message : String(cause))
            }),
          ),
          Effect.as(previous && ([pluginId, previous] as const)),
        ),
      ),
    )
  }

  const applyPlugins = (next: Listing): Effect.Effect<void> =>
    Effect.suspend(() => {
      inventory.builtinOptions = next.builtinOptions
      const removed = [...plugins.keys()].filter((pluginId) => !next.plugins.has(pluginId))
      const changes = [...next.plugins].filter(([pluginId, plugin]) => plugins.get(pluginId) !== plugin)

      if (
        removed.length === 0 &&
        changes.length === 0 &&
        next.reserved.join('\n') === inventory.reserved.join('\n') &&
        [...next.parts.server].join('\n') === [...inventory.server].join('\n') &&
        [...next.parts.unreadable].join('\n') === [...inventory.unreadable].join('\n') &&
        [...next.builtinsListed].join('\n') === [...(inventory.builtinsListed ?? [])].join('\n')
      )
        return Effect.void
      removed.forEach((pluginId) => plugins.delete(pluginId))
      changes.forEach(([pluginId, plugin]) => plugins.set(pluginId, plugin))
      inventory.reserved = next.reserved
      inventory.server = next.parts.server
      inventory.unreadable = next.parts.unreadable
      inventory.builtinsListed = next.builtinsListed

      return Effect.andThen(changed, publish)
    })

  const firstListed = Deferred.succeed(firstListing, undefined).pipe(
    Effect.flatMap((first) => (first && plugins.size === 0 ? publish : Effect.void)),
  )

  const publish = Effect.suspend(() =>
    PubSub.publish(signals, {type: 'pluginExperimentals', ...pluginExperimentals()}),
  ).pipe(Effect.asVoid)

  const pluginExperimentals = (): BridgePluginExperimentals => ({
    plugins: [...plugins.values()],
    reserved: inventory.reserved,
  })

  const enabled = (pluginId: string) =>
    pluginEnabled({id: pluginId, builtin: local.includes(pluginId)}, enableState.rows ?? [])

  const known = (pluginId: string) => local.includes(pluginId) || plugins.has(pluginId)

  const installed = (): readonly Installed[] => [
    ...local.map((pluginId) => ({
      id: pluginId,
      builtin: true,
      enabled: enabled(pluginId),
      ...(ENGINE_HALVES.has(pluginId) && inventory.builtinsListed
        ? {server: inventory.builtinsListed.has(pluginId)}
        : {}),
    })),
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

  const changed = Effect.suspend(() =>
    enableState.rows === undefined ? Effect.void : PubSub.publish(signals, {type: 'installed', list: installed()}),
  ).pipe(Effect.asVoid)

  const settle = (rows: readonly EnableState[]) =>
    Effect.suspend(() => {
      const before = enableState.rows === undefined ? [] : installed()
      enableState.rows = rows

      return isEqual(before, installed()) ? Effect.void : changed
    })

  const setEnabled = (pluginId: string, value: boolean) =>
    Effect.gen(function* () {
      if (!known(pluginId)) return yield* Effect.fail(pluginError('notFound'))

      yield* Deferred.await(loaded)
      const previous = enableState.rows
      enableState.rows = uniqBy([{id: pluginId, enabled: value}, ...(previous ?? [])], (row) => row.id)
      yield* changed

      yield* engine.setEnabled(pluginId, value).pipe(
        Effect.tapError(() =>
          Effect.suspend(() => {
            enableState.rows = previous

            return changed
          }),
        ),
      )
    })

  const signalStream = Stream.fromPubSub(signals)

  const stop = Effect.all(
    [
      Deferred.fail(loaded, PluginSourceClosed.make({message: 'the plugin manager was disposed'})),
      Deferred.fail(
        firstListing,
        PluginSourceClosed.make({message: 'the engine trust ended before the engine first listed its plugins'}),
      ),
      dispatch({type: 'stopped'}),
    ],
    {discard: true},
  )

  yield* dispatch({type: 'started', endpoint: endpointFor(input.address), quitting: false})

  yield* Effect.addFinalizer(() => stop)

  const driver: BundleDriverShape = {
    following: Effect.sync(() => followed() !== undefined),
    pluginExperimentals: Deferred.await(firstListing).pipe(Effect.map(pluginExperimentals)),
    enableLoaded: Deferred.await(loaded),
    installed: Effect.sync(installed),
    builtinOptions: (pluginId) => inventory.builtinOptions.get(pluginId),
    listen: (handle) =>
      FiberSet.run(
        listeners,
        signalStream.pipe(
          Stream.runForEach((signal) =>
            Effect.try({try: () => handle(signal), catch: (cause) => cause}).pipe(
              Effect.catch((cause) => Effect.logError('[plugin] a plugin source listener failed', cause)),
            ),
          ),
        ),
      ),
    setEnabled,
    reload: (pluginId) => (known(pluginId) ? changed : Effect.fail(pluginError('notFound'))),
    stop,
  }

  return driver
})

function followApiBase(apiBase: Accessor<string>): Stream.Stream<string> {
  return callbackStream<string>((emit) => {
    const subscription = observable(apiBase).subscribe(emit)

    return () => subscription.unsubscribe()
  }).pipe(Stream.orDie)
}

export function createBundleSource(input: {
  readonly client: ConcivClient
  readonly apiBase: Accessor<string>
  readonly builtins: readonly Entry[]
  readonly engineTimings?: Partial<EngineConnectionTimings>
}): BundleSource {
  const runtime = ManagedRuntime.make(
    Layer.effect(
      BundleDriver,
      makeBundleSource({
        address: untrack(input.apiBase),
        addresses: followApiBase(input.apiBase),
        builtins: input.builtins,
      }),
    ).pipe(
      Layer.provide(
        livePluginEngine(
          input.client,
          input.builtins.map((definition) => definition.id),
          input.engineTimings,
        ),
      ),
    ),
  )
  const driver = runtime.runSync(
    Effect.gen(function* () {
      return yield* BundleDriver
    }),
  )
  const enableLoaded = runtime.runPromise(driver.enableLoaded)
  const following = runtime.runSync(driver.following)
  enableLoaded.catch(() => undefined)
  const listen = (handle: (signal: BundleSignal) => void) => {
    const fiber = runtime.runSync(driver.listen(handle))

    return () => {
      runtime.runFork(Fiber.interrupt(fiber))
    }
  }

  return {
    pluginExperimentals: () => runtime.runPromise(driver.pluginExperimentals),
    on: (listener) =>
      listen((signal) => {
        if (signal.type === 'pluginExperimentals') listener(signal)
      }),
    onPluginListChange: (listener) =>
      listen((signal) => {
        if (signal.type === 'plugin-list-changed') listener()
      }),
    onSessionsChanged: (listener) =>
      listen((signal) => {
        if (signal.type === 'sessions-changed') listener(signal.sessionId)
      }),
    builtinOptions: driver.builtinOptions,
    manager: {
      initial: following ? enableLoaded : Promise.resolve(undefined),
      list: () =>
        runtime.runSync(driver.following)
          ? enableLoaded.then(() => runtime.runPromise(driver.installed))
          : runtime.runPromise(driver.installed),
      on: (listener) =>
        listen((signal) => {
          if (signal.type === 'installed') listener(signal)
        }),
      enable: (pluginId) => runtime.runPromise(driver.setEnabled(pluginId, true)),
      disable: (pluginId) => runtime.runPromise(driver.setEnabled(pluginId, false)),
      reload: (pluginId) => runtime.runPromise(driver.reload(pluginId)),
    },
    dispose: () => {
      runtime.runPromise(driver.stop).finally(() => runtime.dispose())
    },
  }
}
