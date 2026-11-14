import {abort} from './abort'
import {
  batch,
  catchError,
  createContext,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  ErrorBoundary,
  getOwner,
  onCleanup,
  onMount,
  runWithOwner,
  untrack,
  useContext,
  type Accessor,
  type JSX,
  type Owner,
  type ParentProps,
} from 'solid-js'
import {createStore} from 'solid-js/store'
import {LifetimeContext, liveAccessor, PluginContext, type Entry} from '@conciv/plugin/experimental/host'
import {useDialog} from './dialog-stack'
import {
  LinkHandler,
  type BaseContext,
  type Cleanup,
  type Context,
  type Contract,
  type DialogHandle,
  type Dialogs,
  type Link,
  type Links,
  type Live,
  type Persisted,
  type PluginOptions,
  type Registry,
  type SessionRef,
  type SetupContext,
  type Token,
} from '@conciv/plugin/experimental'
import type {ConcivClient} from '@conciv/plugin'
import {
  createPluginDialogState,
  transitionPluginDialog,
  type PluginDialogEffect,
  type PluginDialogEvent,
} from './dialog-machine'
import {selectDisabled, selectHostReady, selectInstalled, selectServersReady} from './machine'
import {
  createPluginHostState,
  selectPluginDefinitions,
  selectPluginFailure,
  selectPluginInstance,
  selectPluginInstances,
  selectPluginSettled,
  selectPluginStatus,
  transitionPluginHost,
  type PluginHostEffect,
  type PluginHostEvent,
} from './instance-machine'
import {createStartupGate, type InstalledSource} from './startup'
import {assertStoreDefinition} from '../persistence/schema'
import {createSessionStore, storeName, whenLoaded} from './stores'

type Contribution = {key: string; registry: string; plugin: string; value: Accessor<unknown>}

export type Item<T> = {readonly key: string; readonly plugin: string; readonly value: T}

type InstanceContext = SetupContext<Entry>

type Instance = {
  definition: Entry
  context: InstanceContext
  root: Owner | null
  dispose: () => void
  own(fn: Cleanup): Cleanup
  prepare(): Promise<readonly void[]>
  preload(session: SessionRef): void
}

export type PluginInput = {readonly options: PluginOptions; readonly client: () => ConcivClient | undefined}

type HostApis = Omit<Context, keyof BaseContext | 'provide' | 'use'>

type HostApiFactory<T> = (
  plugin: string,
  owner: Owner | null,
  context: Context,
  register: (fn: Cleanup) => Cleanup,
  builtin: boolean,
) => T

export type HostApiFactories = {
  readonly [K in Exclude<keyof HostApis, 'links' | 'dialogs'>]: HostApiFactory<HostApis[K]>
}

type Absent = Exclude<Live<never>, {readonly status: 'active'}>

type HostState = {
  entries: Record<string, Contribution[] | undefined>
  contracts: Record<string, number | undefined>
}

const activationTimeout = 30_000

type Stores = Record<string, Persisted<object> | ((session: SessionRef) => Persisted<object>)>

const pending: Absent = {status: 'pending'}

const inactive = {
  disabled: {status: 'inactive', reason: 'disabled'},
  failed: {status: 'inactive', reason: 'failed'},
} as const satisfies Record<string, Absent>

const HostContext = createContext<ReturnType<typeof createHost>>()

export function usePluginHost() {
  const host = useContext(HostContext)

  if (!host) throw new Error('Plugin host is unavailable')

  return host
}

type HostInput = {
  definitions: Accessor<readonly Entry[]>
  disabled?: Accessor<ReadonlySet<string>>
  installed?: InstalledSource
  builtins?: ReadonlySet<string>
  servers?: boolean
  apis: HostApiFactories
  whenMounted: (run: () => void) => () => void
  plugin?: (id: string) => PluginInput | undefined
  unavailableClient: () => ConcivClient
}

export function PluginHostProvider(props: ParentProps<HostInput>) {
  const host = createHost(props)

  return <HostContext.Provider value={host}>{props.children}</HostContext.Provider>
}

function createHost(input: HostInput) {
  const owner = getOwner()
  const provided = new Map<string, {live: Live<unknown> & {readonly status: 'active'}}>()
  const generations = new Map<string, number>()

  const [state, setState] = createStore<HostState>({entries: {}, contracts: {}})

  const [machine, setMachine] = createSignal(createPluginHostState<Instance>())
  const queue: PluginHostEvent<Instance>[] = []
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const memos = new Map<string, Accessor<readonly Item<unknown>[]>>()
  const sequence = {value: 0}

  const providers = new Map<string, string | undefined>()

  const all = input.definitions

  const startup = createStartupGate({
    installed: input.installed,
    plugins: untrack(all).flatMap((definition) => (definition.windowEntry ? [definition.id] : [])),
    servers: input.servers ?? false,
  })

  const disabled = createMemo(
    () =>
      input.disabled?.() ??
      selectDisabled(
        startup.state(),
        all().map((definition) => definition.id),
        input.builtins ?? new Set<string>(),
      ),
    undefined,
    {equals: (a, b) => a === b || (!!a && !!b && a.size === b.size && [...a].every((id) => b.has(id)))},
  )

  const providerOf = (id: string) => {
    const current = providers.get(id)

    if (current) return current

    const definitions = all()

    const found = definitions.find((definition) => owns(definition.id, id))

    if (found) providers.set(id, found.id)

    return found?.id
  }

  const absent = (id: string): Absent => {
    const plugin = providerOf(id)

    if (!plugin) return inactive.disabled

    const status = selectPluginStatus(machine(), plugin)

    if (status === 'disabled') return inactive.disabled

    if (status === 'failed') return inactive.failed

    if (status === 'active') return inactive.disabled

    return pending
  }

  const contractLive = (token: Contract<unknown>): Live<unknown> => {
    void state.contracts[token.id]

    return provided.get(token.id)?.live ?? absent(token.id)
  }

  const createItems = (id: string) => {
    const cache = new Map<string, Item<unknown>>()

    const created = runWithOwner(owner, () =>
      createMemo(() => {
        const next = (state.entries[id] ?? []).flatMap((entry) => {
          const value = entry.value()

          if (value === undefined) return []

          const previous = cache.get(entry.key)

          if (previous?.value === value) return [previous]

          const item = {key: entry.key, plugin: entry.plugin, value}

          cache.set(entry.key, item)

          return [item]
        })

        if (cache.size > next.length) {
          const live = new Set(next.map((item) => item.key))

          cache.forEach((_, key) => {
            if (!live.has(key)) cache.delete(key)
          })
        }

        return next
      }),
    )

    const memo = created ?? (() => [])

    memos.set(id, memo)

    return memo
  }

  const items = <T,>(registry: Registry<T>) => {
    const memo = memos.get(registry.id) ?? createItems(registry.id)

    return memo() as readonly Item<T>[]
  }

  const list = <T,>(registry: Registry<T>) => items(registry).map((item) => item.value)

  const pickLinkHandler = (link: Link) =>
    list(LinkHandler)
      .filter((item) => item.match(link))
      .reduce<LinkHandler | undefined>(
        (best, item) => (!best || (item.priority ?? 0) > (best.priority ?? 0) ? item : best),
        undefined,
      )

  const links: Links = {
    open(link) {
      const handler = untrack(() => pickLinkHandler(link))

      if (!handler) return false

      handler.open(link)

      return true
    },
    exists: (link) => untrack(() => pickLinkHandler(link)?.exists?.(link) ?? false),
  }

  const dialog = useDialog()

  const factories = {
    ...input.apis,
    links: () => links,
    dialogs: (plugin, _, context, register): Dialogs => {
      const open = (
        render: (dialog: DialogHandle) => JSX.Element,
        options?: {readonly replace?: boolean},
        ended?: () => void,
      ): DialogHandle => {
        const id = `plugin:${plugin}:${sequence.value++}`
        const opening = new AbortController()
        const edge = {state: createPluginDialogState(), cancel: () => {}, release: () => {}}
        const queue: PluginDialogEvent[] = []

        const dispatch = (event: PluginDialogEvent) => {
          queue.push(event)

          if (queue.length === 1) drain()
        }

        const drain = () => {
          const event = queue[0]

          if (!event) return

          const next = transitionPluginDialog(edge.state, event)

          edge.state = next.state
          next.effects.forEach(run)
          queue.shift()
          drain()
        }

        const handle = {close: () => dispatch({type: 'close'})}

        const run = (effect: PluginDialogEffect) => {
          if (effect.type === 'register') return void (edge.release = register(handle.close))

          if (effect.type === 'wait') return void (edge.cancel = input.whenMounted(() => dispatch({type: 'mounted'})))

          if (effect.type === 'cancel') return edge.cancel()

          if (effect.type === 'release') return void edge.release()

          if (effect.type === 'abort') return abort(opening)

          if (effect.type === 'close') return dialog.close(id)

          if (effect.type === 'ended') return ended?.()

          void dialog[options?.replace ? 'show' : 'push'](
            () => {
              onCleanup(() => dispatch({type: 'dismissed'}))

              return (
                <ErrorBoundary
                  fallback={(error) => {
                    onMount(() => {
                      handle.close()
                      fail(plugin, error)
                    })

                    return null
                  }}
                >
                  <PluginContext.Provider value={context}>{untrack(() => render(handle))}</PluginContext.Provider>
                </ErrorBoundary>
              )
            },
            () => dispatch({type: 'dismissed'}),
            id,
            AbortSignal.any([opening.signal, context.signal]),
          )
        }

        dispatch({type: 'open', aborted: context.signal.aborted})

        return handle
      }

      return {
        open: (render, options) => open(render, options),
        active: () => !!dialog.active,
        confirm: undefined,
        alert: undefined,
        prompt: undefined,
        select: undefined,
      }
    },
  } satisfies {readonly [K in keyof HostApis]: HostApiFactory<HostApis[K]>}

  const dispatch = (event: PluginHostEvent<Instance>) => {
    queue.push(event)

    if (queue.length === 1) untrack(drain)
  }

  const drain = () => {
    const event = queue[0]

    if (!event) return

    const next = transitionPluginHost(machine(), event)

    void Promise.try(() => setMachine(next.state)).catch((cause: unknown) => console.error('[plugin] host', cause))
    next.effects.forEach(
      (effect) => void Promise.try(() => run(effect)).catch((cause: unknown) => crashed(effect, cause)),
    )
    queue.shift()
    drain()
  }

  const crashed = (effect: PluginHostEffect<Instance>, cause: unknown) => {
    if ('attempt' in effect) return dispatch({type: 'failed', id: effect.id, attempt: effect.attempt, cause})

    console.error(`[plugin] ${'id' in effect ? effect.id : effect.instance.definition.id}`, cause)
  }

  const run = (effect: PluginHostEffect<Instance>) => {
    if (effect.type === 'load')
      return void Promise.try(effect.load).then(
        (module) => dispatch({type: 'loaded', id: effect.id, attempt: effect.attempt, setup: module.default}),
        (cause: unknown) => dispatch({type: 'failed', id: effect.id, attempt: effect.attempt, cause}),
      )

    if (effect.type === 'create')
      return void runWithOwner(owner, () =>
        createRoot((dispose) => {
          const root = getOwner()

          try {
            const instance = createInstance(effect.definition, dispose, root)

            if (root) root.context = {...root.context, [PluginContext.id]: instance.context}

            dispatch({type: 'created', id: effect.id, attempt: effect.attempt, instance, setup: effect.setup})
          } catch (cause) {
            dispose()
            dispatch({type: 'failed', id: effect.id, attempt: effect.attempt, cause})
          }
        }),
      )

    if (effect.type === 'prepare')
      return void Promise.try(effect.instance.prepare).then(
        () => dispatch({type: 'prepared', id: effect.id, attempt: effect.attempt}),
        (cause: unknown) => dispatch({type: 'failed', id: effect.id, attempt: effect.attempt, cause}),
      )

    if (effect.type === 'start') return runWithOwner(effect.instance.root, () => start(effect))

    if (effect.type === 'dispose') return effect.instance.dispose()

    if (effect.type === 'timer.start') {
      clearTimeout(timers.get(effect.id))
      timers.set(
        effect.id,
        setTimeout(() => dispatch({type: 'timeout', id: effect.id, attempt: effect.attempt}), activationTimeout),
      )

      return
    }

    if (effect.type === 'timer.stop') {
      clearTimeout(timers.get(effect.id))
      timers.delete(effect.id)

      return
    }

    if (effect.type === 'forget')
      return providers.forEach((plugin, token) => {
        if (plugin === effect.id) providers.delete(token)
      })

    console.error(`[plugin] ${effect.id}`, effect.cause)
  }

  const start = (effect: Extract<PluginHostEffect<Instance>, {type: 'start'}>) => {
    const failed = (cause: unknown) => dispatch({type: 'failed', id: effect.id, attempt: effect.attempt, cause})
    const sync = {running: true}
    const setup = effect.setup as (ctx: InstanceContext) => Cleanup | void

    catchError(
      () =>
        untrack(() => {
          const returned = setup(effect.instance.context)

          if (typeof returned === 'function') return void effect.instance.own(returned)

          if (!isPromiseLike(returned)) return

          void Promise.resolve(returned).catch((cause: unknown) => console.error(`[plugin] ${effect.id}`, cause))
          throw new Error('Window setup must be synchronous. Start async work with createKeyed or createLatest.')
        }),
      (cause) => (sync.running ? failed(cause) : queueMicrotask(() => failed(cause))),
    )

    sync.running = false
    dispatch({type: 'started', id: effect.id, attempt: effect.attempt})
  }

  const createInstance = (definition: Entry, dispose: () => void, root: Owner | null): Instance => {
    const plugin = definition.id
    const controller = new AbortController()
    const cleanups = new Set<Cleanup>()

    const release = (fn: Cleanup) =>
      void Promise.try(fn).catch((cause: unknown) => console.error(`[plugin] ${plugin}`, cause))

    const own = (fn: Cleanup): Cleanup => {
      if (controller.signal.aborted) {
        release(fn)

        return () => {}
      }

      const cleanup = () => {
        if (cleanups.delete(cleanup)) return fn()
      }

      cleanups.add(cleanup)

      return cleanup
    }

    const late = () => controller.signal.aborted || !!useContext(LifetimeContext)?.ended

    const register = (fn: Cleanup): Cleanup => {
      if (late()) {
        release(fn)

        return () => {}
      }

      const cleanup = own(fn)
      const scope = getOwner()

      if (scope && scope !== root) onCleanup(() => void cleanup())

      return cleanup
    }

    const lives = new Map<string, Accessor<Live<unknown>>>()

    const liveOf = (token: Token) => {
      const existing = lives.get(token.id)

      if (existing) return existing

      const read = liveAccessor(() => contractLive(token))

      lives.set(token.id, read)

      return read
    }

    const stores: Stores = {}

    const experimental = input.plugin?.(plugin)

    const context = {
      id: plugin,
      options: experimental?.options ?? {},
      get client() {
        return experimental?.client() ?? input.unavailableClient()
      },
      signal: controller.signal,
      add<T>(registry: Registry<T>, item: T | (() => T | undefined)) {
        if (late()) return () => {}

        const read =
          typeof item === 'function'
            ? runWithOwner(getOwner() ?? root, () => createMemo(item as () => T | undefined))
            : () => item

        const key = `${plugin}/${++sequence.value}`

        setState('entries', registry.id, (entries = []) => [
          ...entries,
          {key, registry: registry.id, plugin, value: read ?? (() => undefined)},
        ])

        return register(() =>
          setState('entries', registry.id, (entries = []) => entries.filter((entry) => entry.key !== key)),
        )
      },
      list,
      provide<T>(token: Contract<T>, impl: T) {
        if (!owns(plugin, token.id)) throw new Error(`${plugin} provides only its own contracts, not "${token.id}"`)

        if (late()) return () => {}

        const generation = (generations.get(token.id) ?? 0) + 1

        generations.set(token.id, generation)

        const entry = {live: {status: 'active', value: impl, generation} as const}

        provided.set(token.id, entry)
        setState('contracts', token.id, (version = 0) => version + 1)

        return register(() => {
          if (provided.get(token.id) !== entry) return

          provided.delete(token.id)
          setState('contracts', token.id, (version = 0) => version + 1)
        })
      },
      use: liveOf,
      stores,
    }

    const created = new Map<string, HostApis[keyof HostApis]>()

    Object.defineProperties(
      context,
      Object.fromEntries(
        Object.entries(factories).map(([name, create]) => [
          name,
          {
            enumerable: true,
            get() {
              if (!created.has(name)) created.set(name, create(plugin, root, typed, register, !experimental))

              return created.get(name)
            },
          },
        ]),
      ),
    )

    const typed = context as unknown as InstanceContext

    const sessions: ReturnType<typeof createSessionStore<object>>[] = []

    return {
      definition,
      context: typed,
      root,
      own,
      prepare() {
        const storage = typed.storage

        const loaded = windowStores(definition).flatMap(([name, declaration]) => {
          assertStoreDefinition(storeName(plugin, name), declaration.schema, declaration.initial)
          const options = {
            schema: declaration.schema,
            initial: declaration.initial,
            from: declaration.from,
          }

          if (declaration.scope === 'global' || declaration.scope === 'project') {
            const handle = storage.store(name, {...options, scope: declaration.scope})

            stores[name] = handle

            return [whenLoaded(handle)]
          }

          const store = createSessionStore({
            open: (session) => storage.store(name, {...options, scope: {session}}),
            owner: root,
            sessions: typed.sessions,
          })

          stores[name] = store.get
          sessions.push(store)

          return []
        })

        if (sessions.length > 0) own(() => sessions.forEach((store) => store.dispose()))

        return Promise.all(loaded)
      },
      preload: (session) => sessions.forEach((store) => store.get(session)),
      dispose() {
        abort(controller)
        batch(() => {
          Array.from(cleanups).toReversed().forEach(release)
          cleanups.clear()
          Object.entries(state.entries).forEach(([registry, entries]) => {
            if (!entries?.some((entry) => entry.plugin === plugin)) return

            setState('entries', registry, (list = []) => list.filter((entry) => entry.plugin !== plugin))
          })
        })
        release(dispose)
      },
    }
  }

  const fail = (id: string, cause: unknown) => dispatch({type: 'render.failed', id, cause})

  createMemo(() => dispatch({type: 'reconcile', definitions: all(), disabled: disabled()}))

  createRenderEffect(() => {
    const gate = startup.state()

    if (gate.status !== 'activating') return

    const current = machine()

    gate.pending.forEach((id) => {
      if (selectPluginSettled(current, id)) startup.dispatch({type: 'plugin.settled', id})
    })
  })

  onCleanup(() => dispatch({type: 'disposed'}))

  return {
    state,
    ready: createMemo(() => selectHostReady(startup.state())),
    serversReady: createMemo(() => selectServersReady(startup.state())),
    installed: createMemo(() => selectInstalled(startup.state())),
    gate: startup.dispatch,
    list,
    items,
    links,
    definitions: () => selectPluginDefinitions(machine(), all()),
    status: (id: string) => selectPluginStatus(machine(), id),
    failure: (id: string) => selectPluginFailure(machine(), id),
    context: (id: string): Context | undefined => selectPluginInstance(machine(), id)?.context,
    fail,
    preload(session: SessionRef) {
      selectPluginInstances(untrack(machine)).forEach((instance) => instance.preload(session))
    },
    reload: (id: string, next?: Entry) => dispatch({type: 'reload', id, next}),
  }
}

function windowStores(definition: Entry) {
  return Object.entries(definition.stores ?? {})
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

function owns(plugin: string, id: string) {
  return id === plugin || id.startsWith(`${plugin}.`)
}
