import {createEventSignal} from '@solid-primitives/event-listener'
import {createResource, type Accessor} from 'solid-js'

declare global {
  interface Permissions {
    query(descriptor: {name: 'local-network-access'}): Promise<PermissionStatus>
  }
}

export type LocalNetworkAccessState = 'unknown' | 'unsupported' | 'prompt' | 'granted' | 'denied'

function queryLocalNetworkAccess(): Promise<PermissionStatus | null> {
  if (!navigator.permissions) return Promise.resolve(null)
  return navigator.permissions.query({name: 'local-network-access'}).catch(() => null)
}

export function useLocalNetworkAccessPermission(): Accessor<LocalNetworkAccessState> {
  const [status] = createResource(queryLocalNetworkAccess)
  const changed = createEventSignal<{change: Event}>(() => {
    const current = status()
    return current ? [current] : []
  }, 'change')
  return () => {
    changed()
    if (status.loading) return 'unknown'
    return status()?.state ?? 'unsupported'
  }
}
