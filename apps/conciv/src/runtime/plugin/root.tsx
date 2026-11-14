import {createMemo, createSignal, lazy, onCleanup, Show, Suspense, untrack, type ParentProps} from 'solid-js'
import type {Entry} from '@conciv/plugin/experimental/host'
import type {ConcivClient} from '@conciv/plugin'
import {useRouteContext} from '@tanstack/solid-router'
import {useApiBase} from '../../app/context'
import {builtins} from './builtins'
import {createBundleSource, type BundleSource, type PluginManager} from './bundle-source'
import {PluginExperimentalLoader, type PluginExperimental, type PluginExperimentalSource} from './plugins'
import {PluginHostProvider, usePluginHost} from './host'
import type {InstalledSource} from './startup'
import {createPluginAttachment, createHostApis, PluginAttachmentProvider, type HostApis} from './host-apis'
import {createContext, useContext} from 'solid-js'

const HostApisContext = createContext<HostApis>()

const PluginsContext = createContext<{
  source: () => PluginExperimentalSource | undefined
  client: () => ConcivClient | undefined
  manager: () => PluginManager | undefined
  onPluginListChange: (listener: () => void) => () => void
  set: (plugins: readonly PluginExperimental[], reserved: readonly string[]) => void
  reserved: () => readonly string[]
  reported: () => readonly string[] | undefined
}>()

const PluginHotReload = import.meta.env.DEV ? lazy(() => import('./hmr')) : undefined

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

export function useHostApis() {
  const value = useContext(HostApisContext)

  if (!value) throw new Error('Host APIs are unavailable')

  return value
}

export function PluginRoot(props: ParentProps) {
  const apis = createHostApis()
  const apiBase = untrack(useApiBase())
  const login = useRouteContext({strict: false, select: (context) => context.login})
  const trusted = createMemo(() => {
    const engine = login()

    return engine === undefined || engine.status() === 'trusted'
  })
  const first = Promise.withResolvers<BundleSource>()
  const listeners = new Set<Parameters<InstalledSource['on']>[0]>()
  const pluginListListeners = new Set<() => void>()

  first.promise.catch(() => undefined)

  const bundle = createMemo(() => {
    if (!trusted()) return

    const created = createBundleSource({client: apis.engine.client, apiBase})

    first.resolve(created)
    onCleanup(created.manager.on((message) => listeners.forEach((listener) => listener(message))))
    onCleanup(created.onPluginListChange(() => pluginListListeners.forEach((listener) => listener())))
    onCleanup(created.dispose)

    return created
  })

  const installed: InstalledSource = {
    initial: first.promise.then((created) => created.manager.initial),
    list: async () => (untrack(bundle) ?? (await first.promise)).manager.list(),
    on(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
  }

  const [loaded, setLoaded] = createSignal<{
    settled: boolean
    plugins: readonly PluginExperimental[]
    reserved: readonly string[]
  }>({settled: false, plugins: [], reserved: []})

  const definitions = createMemo<readonly Entry[]>(
    () => [...builtins, ...loaded().plugins.map((plugin) => plugin.definition)],
    [],
    {
      equals: (a, b) => a.length === b.length && a.every((definition, index) => definition === b[index]),
    },
  )

  const builtinIds = new Set(builtins.map((builtin) => builtin.id))

  return (
    <HostApisContext.Provider value={apis}>
      <PluginsContext.Provider
        value={{
          source: bundle,
          client: () => apis.engine.client,
          manager: () => bundle()?.manager,
          onPluginListChange(listener) {
            pluginListListeners.add(listener)

            return () => pluginListListeners.delete(listener)
          },
          set: (plugins, reserved) => setLoaded({settled: true, plugins, reserved}),
          reserved: () => loaded().reserved,
          reported: () => {
            const status = login()?.status() ?? 'trusted'

            if (status === 'checking') return undefined

            if (status !== 'trusted') return []

            return loaded().settled ? loaded().plugins.map((plugin) => plugin.definition.id) : undefined
          },
        }}
      >
        <PluginHostProvider
          definitions={definitions}
          installed={installed}
          builtins={builtinIds}
          apis={apis.apis}
          whenMounted={apis.whenMounted}
          plugin={(id) => loaded().plugins.find((plugin) => plugin.definition.id === id)}
          unavailableClient={apis.unavailableClient}
        >
          {PluginHotReload && (
            <Suspense>
              <PluginHotReload />
            </Suspense>
          )}
          {props.children}
        </PluginHostProvider>
      </PluginsContext.Provider>
    </HostApisContext.Provider>
  )
}

export function PluginAttachment(props: ParentProps) {
  const host = usePluginHost()
  const attachment = createPluginAttachment(useHostApis())
  const plugins = useContext(PluginsContext)

  return (
    <PluginAttachmentProvider value={attachment}>
      <Show when={plugins?.source()} keyed>
        {(source) => (
          <PluginExperimentalLoader
            source={source}
            client={plugins?.client ?? (() => undefined)}
            onChange={(loaded, reserved) => plugins?.set(loaded, reserved)}
          />
        )}
      </Show>
      <Show when={host.ready()}>
        <MountedInterface attach={attachment.attach} />
      </Show>
      {props.children}
    </PluginAttachmentProvider>
  )
}

function MountedInterface(props: {attach: () => () => void}) {
  onCleanup(props.attach())

  return null
}
