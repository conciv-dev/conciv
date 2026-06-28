import {Show, type JSX} from 'solid-js'
import {JazzProvider, createSolidJazzClient, useLocalFirstAuth} from 'jazz-tools/solid'

export type JazzConfig = {serverUrl: string; appId: string}

export async function fetchJazzConfig(extBase: string): Promise<JazzConfig> {
  const response = await fetch(`${extBase}/config`)
  return response.json()
}

export function WhiteboardJazzProvider(props: {
  config: JazzConfig
  fallback?: JSX.Element
  children: JSX.Element
}): JSX.Element {
  const auth = useLocalFirstAuth()
  return (
    <Show when={!auth.isLoading && auth.secret} fallback={props.fallback}>
      {(secret) => {
        const client = createSolidJazzClient(() => ({
          appId: props.config.appId,
          serverUrl: props.config.serverUrl,
          secret: secret(),
          // In-memory cache, no OPFS offline store: this provider mounts above the session <Show> so it
          // survives session switches, and reload re-syncs from the server dataDir (the source of truth).
          driver: {type: 'memory'},
        }))
        return (
          <JazzProvider client={client} fallback={props.fallback}>
            {props.children}
          </JazzProvider>
        )
      }}
    </Show>
  )
}
