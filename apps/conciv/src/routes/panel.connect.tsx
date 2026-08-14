import {HostApiProvider} from '@conciv/extension'
import {createFileRoute, useRouter} from '@tanstack/solid-router'
import {Show, createSignal, type JSX} from 'solid-js'
import {useConnectBinding, useInstances} from '../app/context.js'
import {ExtensionSurface} from '../extension/extension-slots.js'
import {ErrorScreen} from '../shell/error-screen.js'

const BIND_FAILED_MESSAGE = "conciv couldn't connect to that workspace. Check that the dev server is still running."

export const Route = createFileRoute('/panel/connect')({component: ConnectRoute})

function ConnectRoute(): JSX.Element {
  const instances = useInstances()
  const binding = useConnectBinding()
  const router = useRouter()
  const [failedApiBase, setFailedApiBase] = createSignal<string | null>(null)

  const attempt = (apiBase: string): void => {
    setFailedApiBase(null)
    void binding
      .bind(apiBase)
      .then((sessionId) =>
        router.navigate({to: '/panel/$sessionId', params: {sessionId}, search: {open: true}, replace: true}),
      )
      .catch((error) => {
        console.error('conciv connect handoff failed', error)
        setFailedApiBase(apiBase)
      })
  }

  return (
    <HostApiProvider connect={{origin: window.location.origin, found: attempt}}>
      <Show when={failedApiBase()} fallback={<ExtensionSurface name="connect" instances={instances} />} keyed>
        {(apiBase) => <ErrorScreen message={BIND_FAILED_MESSAGE} onRetry={() => attempt(apiBase)} />}
      </Show>
    </HostApiProvider>
  )
}
