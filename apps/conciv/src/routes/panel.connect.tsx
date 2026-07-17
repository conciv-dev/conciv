import {HostApiProvider} from '@conciv/extension'
import {createFileRoute, useRouter} from '@tanstack/solid-router'
import type {JSX} from 'solid-js'
import {useConnectBinding, useInstances} from '../app/context.js'
import {ExtensionSurface} from '../extension/extension-slots.js'

export const Route = createFileRoute('/panel/connect')({component: ConnectRoute})

function ConnectRoute(): JSX.Element {
  const instances = useInstances()
  const binding = useConnectBinding()
  const router = useRouter()
  const found = (apiBase: string) => {
    void binding
      .bind(apiBase)
      .then((sessionId) =>
        router.navigate({to: '/panel/$sessionId', params: {sessionId}, search: {open: true}, replace: true}),
      )
      .catch((error) => console.error('conciv connect handoff failed', error))
  }
  return (
    <HostApiProvider connect={{origin: window.location.origin, found}}>
      <ExtensionSurface name="connect" instances={instances} />
    </HostApiProvider>
  )
}
