import {HostApiProvider} from '@conciv/extension'
import {createFileRoute, useRouter} from '@tanstack/solid-router'
import {useMutation} from '@tanstack/solid-query'
import {Show, type JSX} from 'solid-js'
import {useConnectBinding, useInstances} from '../app/context.js'
import {ExtensionSurface} from '../extension/extension-slots.js'
import {ErrorScreen} from '../shell/error-screen.js'

const BIND_FAILED_MESSAGE = "conciv couldn't connect to that workspace. Check that the dev server is still running."

export const Route = createFileRoute('/panel/connect')({component: ConnectRoute})

function ConnectRoute(): JSX.Element {
  const instances = useInstances()
  const binding = useConnectBinding()
  const router = useRouter()

  const bind = useMutation(() => ({
    mutationFn: (apiBase: string) => binding.bind(apiBase),
    onSuccess: (sessionId) =>
      router.navigate({to: '/panel/$sessionId', params: {sessionId}, search: {open: true}, replace: true}),
  }))

  return (
    <HostApiProvider connect={{origin: window.location.origin, found: (apiBase) => bind.mutate(apiBase)}}>
      <Show
        when={bind.isError ? bind.variables : undefined}
        fallback={<ExtensionSurface name="connect" instances={instances} />}
        keyed
      >
        {(apiBase) => <ErrorScreen message={BIND_FAILED_MESSAGE} onRetry={() => bind.mutate(apiBase)} />}
      </Show>
    </HostApiProvider>
  )
}
