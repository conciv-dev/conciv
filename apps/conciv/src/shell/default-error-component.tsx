import {createMemo, type JSX} from 'solid-js'
import {useRouteContext, useRouter, type ErrorComponentProps} from '@tanstack/solid-router'
import {resetBrowserRpcConnection} from '@conciv/contract'
import {ErrorScreen} from './error-screen.js'
import {classifyRpcError, type RpcErrorClassification} from './rpc-error-message.js'

const ENGINE_UNREACHABLE_MESSAGE = "conciv couldn't reach the engine. Check that the dev server is still running."
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Try again.'

export function defaultErrorComponent(props: ErrorComponentProps): JSX.Element {
  const router = useRouter()
  const apiBase = useRouteContext({strict: false, select: (context) => context.apiBase})
  const classification = createMemo<RpcErrorClassification>(() =>
    classifyRpcError(props.error, ENGINE_UNREACHABLE_MESSAGE, GENERIC_ERROR_MESSAGE),
  )
  const retry = (): void => {
    if (classification().transportFailure) resetBrowserRpcConnection(apiBase()?.() ?? '')
    void router.invalidate()
  }
  return <ErrorScreen message={classification().message} onRetry={retry} />
}
