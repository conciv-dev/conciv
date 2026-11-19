import {createFileRoute, useRouter} from '@tanstack/solid-router'
import {useMutation} from '@conciv/client'
import {resetBrowserRpcConnection} from '@conciv/contract'
import {Show, type JSX} from 'solid-js'
import {createKeyed} from '@conciv/plugin/experimental'
import {useConnectBinding} from '../app/context.js'
import {ErrorScreen} from '../shell/error-screen.js'
import {classifyRpcError} from '../shell/rpc-error-message.js'
import {usePluginServers} from '../runtime/plugin/servers.js'

const BIND_FAILED_MESSAGE = "conciv couldn't connect to that workspace. Check that the dev server is still running."
const GENERIC_ERROR_MESSAGE = 'Something went wrong connecting to that workspace. Try again.'

export const Route = createFileRoute('/panel/connect')({component: ConnectRoute})

function ConnectRoute(): JSX.Element {
  const binding = useConnectBinding()
  const router = useRouter()

  const bind = useMutation(() => ({
    mutationFn: (apiBase: string) => binding.bind(apiBase),
    onSuccess: (sessionId) =>
      router.navigate({to: '/panel/$sessionId', params: {sessionId}, search: {open: true}, replace: true}),
  }))

  createKeyed(usePluginServers().bound, (apiBase) => bind.mutate(apiBase))

  const retry = (apiBase: string): void => {
    if (classifyRpcError(bind.error, BIND_FAILED_MESSAGE, GENERIC_ERROR_MESSAGE).transportFailure)
      resetBrowserRpcConnection(apiBase)
    bind.mutate(apiBase)
  }

  return (
    <Show when={bind.isError ? bind.variables : undefined} keyed>
      {(apiBase) => (
        <ErrorScreen
          message={classifyRpcError(bind.error, BIND_FAILED_MESSAGE, GENERIC_ERROR_MESSAGE).message}
          onRetry={() => retry(apiBase)}
        />
      )}
    </Show>
  )
}
