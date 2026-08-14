import type {JSX} from 'solid-js'
import {useRouteContext, useRouter, type ErrorComponentProps} from '@tanstack/solid-router'
import {reprobeBrowserRpcConnection} from '@conciv/contract'
import {ErrorScreen} from './error-screen.js'

const ENGINE_UNREACHABLE_MESSAGE = "conciv couldn't reach the engine. Check that the dev server is still running."

export function defaultErrorComponent(_props: ErrorComponentProps): JSX.Element {
  const router = useRouter()
  const apiBase = useRouteContext({strict: false, select: (context) => context.apiBase})
  const retry = (): void => {
    reprobeBrowserRpcConnection(apiBase()?.() ?? '')
    void router.invalidate()
  }
  return <ErrorScreen message={ENGINE_UNREACHABLE_MESSAGE} onRetry={retry} />
}
