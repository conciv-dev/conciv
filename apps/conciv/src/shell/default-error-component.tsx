import {createMemo, onCleanup, onMount, type JSX} from 'solid-js'
import {useRouteContext, useRouter, type ErrorComponentProps} from '@tanstack/solid-router'
import {browserRpcConnection, resetBrowserRpcConnection, type TrustListener} from '@conciv/contract'
import {engineLocked} from '../app/engine-login.js'
import {ErrorScreen} from './error-screen.js'
import {classifyRpcError, rpcErrorCode, type RpcErrorClassification} from './rpc-error-message.js'

const ENGINE_UNREACHABLE_MESSAGE = "conciv couldn't reach the engine. Check that the dev server is still running."
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Try again.'

export function defaultErrorComponent(props: ErrorComponentProps): JSX.Element {
  const router = useRouter()
  const apiBase = useRouteContext({strict: false, select: (context) => context.apiBase})
  const login = useRouteContext({strict: false, select: (context) => context.login})
  const classification = createMemo<RpcErrorClassification>(() =>
    classifyRpcError(props.error, ENGINE_UNREACHABLE_MESSAGE, GENERIC_ERROR_MESSAGE),
  )
  const retry = async (): Promise<void> => {
    await login()?.requestTrust()
    if (classification().transportFailure) resetBrowserRpcConnection(apiBase()?.() ?? '')
    await router.invalidate()
  }
  const onTrustChange: TrustListener = (status, previous) => {
    if (status === 'trusted' && engineLocked(previous)) void retry()
  }
  onMount(() => {
    const {trust, release} = browserRpcConnection(apiBase()?.() ?? '')
    if (trust.isTrusted() && rpcErrorCode(props.error) === 'UNAUTHORIZED') void retry()
    onCleanup(trust.subscribe(onTrustChange))
    onCleanup(release)
  })
  return <ErrorScreen message={classification().message} onRetry={() => void retry()} />
}
