import {createContext, createMemo, createRenderEffect, untrack, useContext, type ParentProps} from 'solid-js'
import {createKeyed, Server, type ServerEntry} from '@conciv/plugin/experimental'
import {useApiBase} from '../../app/context'
import {usePluginHost} from './host'

type PluginServer = {readonly key: string; readonly plugin: string; readonly entry: ServerEntry}

const ServersContext = createContext<ReturnType<typeof createPluginServers>>()

export function usePluginServers() {
  const value = useContext(ServersContext)

  if (!value) throw new Error('Plugin servers are unavailable')

  return value
}

export function PluginServersProvider(props: ParentProps<{servers: boolean}>) {
  const value = createPluginServers(untrack(() => props.servers))

  return <ServersContext.Provider value={value}>{props.children}</ServersContext.Provider>
}

function createPluginServers(servers: boolean) {
  const host = usePluginHost()
  const apiBase = useApiBase()

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

  const bound = createMemo(() => {
    const current = routed()

    return current?.entry.state === 'ready' ? current.entry.http?.url : undefined
  })

  return {
    ready: host.serversReady,
    entries,
    entry: (key: string) => entries().find((item) => item.key === key),
    routed,
    bound,
  }
}
