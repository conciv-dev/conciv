import {HostApiProvider} from '@conciv/extension/host'
import {createFileRoute, useRouter} from '@tanstack/solid-router'
import {useMutation} from '@tanstack/solid-query'
import {reprobeBrowserRpcConnection} from '@conciv/contract'
import {Show, type JSX} from 'solid-js'
import {useConnectBinding, useInstances} from '../app/context.js'
import {ExtensionSurface} from '../extension/extension-slots.js'
import {ErrorScreen} from '../shell/error-screen.js'
import {classifyRpcError} from '../shell/rpc-error-message.js'

const BIND_FAILED_MESSAGE = "conciv couldn't connect to that workspace. Check that the dev server is still running."
const GENERIC_ERROR_MESSAGE = 'Something went wrong connecting to that workspace. Try again.'

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

  const retry = (apiBase: string): void => {
    if (classifyRpcError(bind.error, BIND_FAILED_MESSAGE, GENERIC_ERROR_MESSAGE).transportFailure)
      reprobeBrowserRpcConnection(apiBase)
    bind.mutate(apiBase)
  }

  return (
    <HostApiProvider connect={{origin: window.location.origin, found: (apiBase) => bind.mutate(apiBase)}}>
      <Show
        when={bind.isError ? bind.variables : undefined}
        fallback={<ExtensionSurface name="connect" instances={instances} />}
        keyed
      >
        {(apiBase) => (
          <ErrorScreen
            message={classifyRpcError(bind.error, BIND_FAILED_MESSAGE, GENERIC_ERROR_MESSAGE).message}
            onRetry={() => retry(apiBase)}
          />
        )}
      </Show>
    </HostApiProvider>
  )
}
