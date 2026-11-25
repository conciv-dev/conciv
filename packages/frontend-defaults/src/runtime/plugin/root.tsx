import {
  createMemo,
  createResource,
  createSignal,
  lazy,
  on,
  onCleanup,
  Show,
  Suspense,
  untrack,
  type ParentProps,
} from 'solid-js'
import type {Entry} from '@conciv/frontend-plugin-api/host'
import {pluginIdAvailable} from '@internal/frontend-app-api/plugin/installed'
import type {PluginOptions} from '@conciv/frontend-plugin-api'
import type {ConcivClient} from '@conciv/backend-plugin-api'
import {useRouteContext} from '@tanstack/solid-router'
import {useApiBase, useAppData, useEnvironment} from '../../app/context'
import {builtins, BUILTINS_WITH_ENGINE_HALF} from './builtins'
import {
  createBundleSource,
  type BundleSource,
  type PluginManager,
} from '@internal/frontend-app-api/plugin/bundle-source'
import {
  PluginExperimentalLoader,
  type PluginExperimental,
  type PluginExperimentalSource,
} from '@internal/frontend-app-api/plugin/plugins'
import {PluginHostProvider, usePluginHost} from '@internal/frontend-app-api/plugin/host'
import type {InstalledSource} from '@internal/frontend-app-api/plugin/startup'
import {createPluginAttachment, createHostApis, PluginAttachmentProvider} from './host-apis'
import {HostApisProvider, useHostApis} from './host-apis-context'
import {PluginServersProvider} from '@internal/frontend-app-api/plugin/servers'
import {PluginStyles} from '@internal/frontend-app-api/plugin/render'
import {createContext, useContext} from 'solid-js'

const PluginsContext = createContext<{
  source: () => PluginExperimentalSource | undefined
  client: () => ConcivClient | undefined
  manager: () => PluginManager | undefined
  onPluginListChange: (listener: () => void) => () => void
  set: (plugins: readonly PluginExperimental[], reserved: readonly string[]) => void
  reserved: () => readonly string[]
  reported: () => readonly string[] | undefined
}>()

const PluginHotReload = import.meta.env.DEV ? lazy(() => import('@internal/frontend-app-api/plugin/hmr')) : undefined

export function useReservedPlugins() {
  const plugins = useContext(PluginsContext)

  return () => plugins?.reserved() ?? []
}

export function usePluginManager() {
  const plugins = useContext(PluginsContext)

  return () => plugins?.manager()
}

export function usePluginListChange(listener: () => void) {
  const plugins = useContext(PluginsContext)

  onCleanup(plugins?.onPluginListChange(listener) ?? (() => undefined))
}

export function usePluginsKnown() {
  const plugins = useContext(PluginsContext)
  const host = usePluginHost()

  return createMemo(() => {
    const reported = plugins ? plugins.reported() : []

    if (reported === undefined) return 'pending'

    return reported.some((id) => (host.status(id) ?? 'loading') === 'loading') ? 'pending' : 'known'
  })
}

export type ComposedPlugin = readonly [plugin: Entry, options: PluginOptions]

export function reserveComposedPlugins(composed: readonly ComposedPlugin[]): readonly ComposedPlugin[] {
  composed.reduce<readonly Entry[]>((taken, [plugin]) => {
    if (!pluginIdAvailable(plugin.id, taken)) throw new Error(`The plugin id "${plugin.id}" is already taken`)

    return [...taken, plugin]
  }, builtins)

  return composed
}

export function PluginRoot(props: ParentProps<{composed: readonly ComposedPlugin[]; servers: boolean}>) {
  const apis = createHostApis()
  const apiBase = useApiBase()
  const bound = createMemo(() => !props.servers || apiBase() !== '')
  const appData = useAppData()
  const environment = useEnvironment()
  const login = useRouteContext({strict: false, select: (context) => context.login})
  const timings = useRouteContext({strict: false, select: (context) => context.timings})
  const composed = untrack(() => props.composed)
  const local = [...builtins, ...composed.map(([plugin]) => plugin)]
  const trusted = createMemo(() => {
    const engine = login()

    return engine === undefined || engine.status() === 'trusted'
  })
  const first = Promise.withResolvers<BundleSource>()
  const listeners = new Set<Parameters<InstalledSource['on']>[0]>()
  const experimentalListeners = new Set<Parameters<PluginExperimentalSource['on']>[0]>()
  const pluginListListeners = new Set<() => void>()

  first.promise.catch(() => undefined)

  const bundle = createMemo(
    on([trusted, bound], ([isTrusted, isBound]) => {
      if (!isTrusted || !isBound) return

      const created = createBundleSource({
        client: apis.engine.client,
        apiBase,
        builtins: local,
        engineHalf: BUILTINS_WITH_ENGINE_HALF,
        engineTimings: untrack(timings)?.engine,
      })

      first.resolve(created)
      onCleanup(created.manager.on((message) => listeners.forEach((listener) => listener(message))))
      onCleanup(created.on((message) => experimentalListeners.forEach((listener) => listener(message))))
      onCleanup(created.onPluginListChange(() => pluginListListeners.forEach((listener) => listener())))
      onCleanup(
        created.onSessionsChanged(
          (sessionId) =>
            void (sessionId === undefined ? appData.invalidateSessions() : appData.invalidateSession(sessionId)),
        ),
      )
      onCleanup(created.dispose)

      return created
    }),
  )

  const installed: InstalledSource = {
    ...(props.servers ? {} : {initial: first.promise.then((created) => created.manager.initial)}),
    list: async () => {
      const current = untrack(bundle)

      if (current) return current.manager.list()

      if (props.servers) return []

      return (await first.promise).manager.list()
    },
    on(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
  }

  const experimental: PluginExperimentalSource = {
    pluginExperimentals: async () => (untrack(bundle) ?? (await first.promise)).pluginExperimentals(),
    on(listener) {
      experimentalListeners.add(listener)

      return () => experimentalListeners.delete(listener)
    },
  }

  const [ready] = createResource(() => first.promise)

  const [loaded, setLoaded] = createSignal<{
    settled: boolean
    plugins: readonly PluginExperimental[]
    reserved: readonly string[]
  }>({settled: false, plugins: [], reserved: []})

  const definitions = createMemo<readonly Entry[]>(
    () => [...local, ...loaded().plugins.map((plugin) => plugin.definition)],
    [],
    {
      equals: (a, b) => a.length === b.length && a.every((definition, index) => definition === b[index]),
    },
  )

  const builtinIds = new Set(local.map((builtin) => builtin.id))

  return (
    <HostApisProvider value={apis}>
      <PluginsContext.Provider
        value={{
          source: () => (ready.state === 'ready' ? experimental : undefined),
          client: () => apis.engine.client,
          manager: () => bundle()?.manager,
          onPluginListChange(listener) {
            pluginListListeners.add(listener)

            return () => pluginListListeners.delete(listener)
          },
          set: (plugins, reserved) => setLoaded({settled: true, plugins, reserved}),
          reserved: () => loaded().reserved,
          reported: () => {
            if ((login()?.status() ?? 'trusted') !== 'trusted') return undefined

            return loaded().settled ? loaded().plugins.map((plugin) => plugin.definition.id) : undefined
          },
        }}
      >
        <PluginHostProvider
          definitions={definitions}
          installed={installed}
          builtins={builtinIds}
          servers={props.servers}
          options={(id) => composed.find(([plugin]) => plugin.id === id)?.[1] ?? untrack(bundle)?.builtinOptions(id)}
          apis={apis.apis}
          whenMounted={apis.whenMounted}
          plugin={(id) => loaded().plugins.find((plugin) => plugin.definition.id === id)}
          unavailableClient={apis.unavailableClient}
          queryClient={apis.queryClient}
        >
          <PluginStyles root={environment.rootNode} />
          {PluginHotReload && (
            <Suspense>
              <PluginHotReload />
            </Suspense>
          )}
          <PluginServersProvider servers={props.servers} apiBase={apiBase}>
            {props.children}
          </PluginServersProvider>
        </PluginHostProvider>
      </PluginsContext.Provider>
    </HostApisProvider>
  )
}

export function PluginAttachment(props: ParentProps) {
  const host = usePluginHost()
  const attachment = createPluginAttachment(useHostApis())
  const plugins = useContext(PluginsContext)

  return (
    <PluginAttachmentProvider value={attachment}>
      <Show when={plugins?.source()}>
        {(source) => (
          <PluginExperimentalLoader
            source={source()}
            client={plugins?.client ?? (() => undefined)}
            onChange={(loaded, reserved) => plugins?.set(loaded, reserved)}
          />
        )}
      </Show>
      <Show when={host.ready() ? attachment.root() : undefined}>
        {(root) => <MountedInterface attach={() => attachment.attach(root())} />}
      </Show>
      {props.children}
    </PluginAttachmentProvider>
  )
}

function MountedInterface(props: {attach: () => () => void}) {
  onCleanup(props.attach())

  return null
}
