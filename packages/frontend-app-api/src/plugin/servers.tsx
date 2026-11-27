import {
  createContext,
  createMemo,
  createRenderEffect,
  untrack,
  useContext,
  type Accessor,
  type ParentProps,
} from 'solid-js'
import {createKeyed, Server, type ServerEntry} from '@conciv/frontend-plugin-api'
import {usePluginHost} from './host'
import {pluginErrors} from './errors'

type PluginServer = {readonly key: string; readonly plugin: string; readonly entry: ServerEntry}

export type ServerBinding = {readonly apiBase: string; readonly token: string | undefined}

const ServersContext = createContext<ReturnType<typeof createPluginServers>>()

export function usePluginServers() {
  const value = useContext(ServersContext)

  if (!value) throw pluginErrors.SERVERS_UNAVAILABLE()

  return value
}

export function PluginServersProvider(props: ParentProps<{servers: boolean; apiBase: Accessor<string>}>) {
  const value = createPluginServers(
    untrack(() => props.servers),
    () => props.apiBase(),
  )

  return <ServersContext.Provider value={value}>{props.children}</ServersContext.Provider>
}

function createPluginServers(servers: boolean, apiBase: Accessor<string>) {
  const host = usePluginHost()

  host.gate({type: 'inventory.settled'})

  const sources = createMemo(() => host.items(Server).toSorted((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0)))

  createRenderEffect(() => {
    if (host.ready() && sources().every((item) => item.value.ready || host.status(item.plugin) === 'failed'))
      host.gate({type: 'sources.settled'})
  })

  const entries = createMemo(() =>
    sources()
      .filter((item) => item.value.ready)
      .flatMap((item) =>
        item.value.entries.map((entry): PluginServer => ({
          key: `${item.plugin}:${entry.id}`,
          plugin: item.plugin,
          entry,
        })),
      ),
  )

  createKeyed(
    () => (servers && apiBase() !== '' ? apiBase() : undefined),
    () =>
      untrack(host.definitions)
        .filter((definition) => host.status(definition.id) === 'failed')
        .forEach((definition) => host.reload(definition.id)),
  )

  const routed = createMemo(() => {
    if (!servers) return

    const url = apiBase()

    if (url !== '') return entries().find((item) => item.entry.http?.url === url)

    return entries().find((item) => item.entry.state === 'ready' && item.entry.http) ?? entries()[0]
  })

  const bound = createMemo((): ServerBinding | undefined => {
    const current = routed()
    const http = current?.entry.state === 'ready' ? current.entry.http : undefined

    return http === undefined ? undefined : {apiBase: http.url, token: http.password}
  })

  return {
    ready: host.serversReady,
    entries,
    entry: (key: string) => entries().find((item) => item.key === key),
    routed,
    bound,
  }
}
