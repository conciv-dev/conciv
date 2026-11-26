import {createFileRoute, useRouter} from '@tanstack/solid-router'
import {useMutation} from '@conciv/client'
import {Show, type JSX} from 'solid-js'
import {createKeyed} from '@conciv/frontend-plugin-api'
import {useConnectBinding} from '../app/context.js'
import {ErrorScreen} from '../shell/error-screen.js'
import {classifyRpcError} from '../shell/rpc-error-message.js'
import {usePluginServers, type ServerBinding} from '@internal/frontend-app-api/plugin/servers'

const BIND_FAILED_MESSAGE = "conciv couldn't connect to that workspace. Check that the dev server is still running."
const GENERIC_ERROR_MESSAGE = 'Something went wrong connecting to that workspace. Try again.'

export const Route = createFileRoute('/panel/connect')({component: ConnectRoute})

function ConnectRoute(): JSX.Element {
  const binding = useConnectBinding()
  const router = useRouter()
  const connection = Route.useRouteContext({select: (context) => context.connection})

  const bind = useMutation(() => ({
    mutationFn: (server: ServerBinding) => binding.bind(server),
    onSuccess: (sessionId) =>
      router.navigate({to: '/panel/$sessionId', params: {sessionId}, search: {open: true}, replace: true}),
  }))

  createKeyed(usePluginServers().bound, (server) => bind.mutate(server), {
    equals: (previous, next) => previous.apiBase === next.apiBase && previous.token === next.token,
  })

  const retry = (server: ServerBinding): void => {
    if (classifyRpcError(bind.error, BIND_FAILED_MESSAGE, GENERIC_ERROR_MESSAGE).transportFailure)
      connection()()?.reset()
    bind.mutate(server)
  }

  return (
    <Show when={bind.isError ? bind.variables : undefined} keyed>
      {(server) => (
        <ErrorScreen
          message={classifyRpcError(bind.error, BIND_FAILED_MESSAGE, GENERIC_ERROR_MESSAGE).message}
          onRetry={() => retry(server)}
        />
      )}
    </Show>
  )
}
