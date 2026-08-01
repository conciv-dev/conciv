import {makeEventListener} from '@solid-primitives/event-listener'
import {createResource, getOwner, runWithOwner, type Accessor} from 'solid-js'

declare global {
  interface Permissions {
    query(descriptor: {name: 'local-network-access'}): Promise<PermissionStatus>
  }
}

export type LocalNetworkAccessState = 'unknown' | 'unsupported' | 'prompt' | 'granted' | 'denied'

type ResolvedState = Exclude<LocalNetworkAccessState, 'unknown'>

export function useLocalNetworkAccessPermission(): Accessor<LocalNetworkAccessState> {
  const owner = getOwner()
  let subscribed = false
  const [state, {refetch}] = createResource<ResolvedState>(async () => {
    if (!navigator.permissions) return 'unsupported'
    const status = await navigator.permissions.query({name: 'local-network-access'}).catch(() => null)
    if (!status) return 'unsupported'
    if (!subscribed) {
      subscribed = true
      runWithOwner(owner, () => makeEventListener(status, 'change', () => void refetch()))
    }
    return status.state
  })
  return () => state() ?? 'unknown'
}
