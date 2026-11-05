import {Show, createEffect, onCleanup, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {useQuery} from '@tanstack/solid-query'
import {useRouteContext, useRouter, useSearch} from '@tanstack/solid-router'
import {engineProbeRefetchInterval, voteEngineProbeSettled} from '@conciv/client'
import {resetBrowserRpcConnection} from '@conciv/contract'
import {useApiBase, useAppData, useConnected} from '../app/context.js'
import {useEngineReachability} from '../app/reachability.js'
import {useNotices} from './notice-context.js'
import {StandingNotice} from './notices.js'
import {EngineLoginDialog, type EngineLogin} from '../app/engine-login.js'
import {usePanelComposerFocus} from '../app/panel-focus.js'

const ENGINE_STALE_MESSAGE =
  'Engine is running outdated code: the server code on disk is newer than the running engine. Restart the dev server.'

const ENGINE_LOCKED_MESSAGE = 'This browser is no longer authorized to use conciv.'

const ENGINE_UNREACHABLE_KEY = 'engine-unreachable'
const ENGINE_UNREACHABLE_MESSAGE = 'conciv lost connection to the engine.'

export function EngineStaleNotice(): JSX.Element {
  const appData = useAppData()
  const connected = useConnected()
  const reachability = useEngineReachability()
  const notices = useNotices()
  const router = useRouter({warn: false})
  const search = router ? useSearch({strict: false}) : undefined
  const engine = useQuery(() => {
    const online = reachability.online()
    const panelOpen = search?.()?.open === true
    return {
      ...appData.utils.meta.engine.queryOptions(),
      enabled: connected(),
      networkMode: 'always',
      refetchInterval: () => engineProbeRefetchInterval(online, panelOpen),
    }
  })
  const standing = {fingerprint: null as string | null}
  const clear = (): void => {
    if (standing.fingerprint === null) return
    notices.remove(standing.fingerprint)
    standing.fingerprint = null
  }
  const lastSettle = {at: 0}
  createEffect(() => {
    const settledAt = engine.dataUpdatedAt
    if (settledAt === lastSettle.at) return
    lastSettle.at = settledAt
    voteEngineProbeSettled(engine.isSuccess, engine.error)
  })
  createEffect(() => {
    const reading = engine.data
    if (reading === undefined) return
    if (!reading.stale) {
      clear()
      return
    }
    if (standing.fingerprint === reading.fingerprint) return
    clear()
    standing.fingerprint = reading.fingerprint
    notices.notify(ENGINE_STALE_MESSAGE, {key: reading.fingerprint, tone: 'danger', persist: true})
  })
  return null
}

export function EngineUnreachableNotice(): JSX.Element {
  const reachability = useEngineReachability()
  const notices = useNotices()
  const apiBase = useApiBase()
  const router = useRouter()
  const login = useRouteContext({strict: false, select: (context) => context.login})
  const retry = async (): Promise<void> => {
    await login()?.requestTrust()
    resetBrowserRpcConnection(apiBase())
    await router.invalidate()
  }
  createEffect(() => {
    if (!reachability.sustainedOffline()) {
      notices.remove(ENGINE_UNREACHABLE_KEY)
      return
    }
    notices.notify(ENGINE_UNREACHABLE_MESSAGE, {
      key: ENGINE_UNREACHABLE_KEY,
      tone: 'danger',
      persist: true,
      action: {label: 'Retry', run: () => void retry()},
    })
  })
  return null
}

export function EngineLockedNotice(): JSX.Element {
  const login = useRouteContext({strict: false, select: (context) => context.login})
  const lockedLogin = (): EngineLogin | undefined => {
    const current = login()
    return current?.status() === 'untrusted' ? current : undefined
  }
  return <Show when={lockedLogin()}>{(current) => <LockedNotice login={current()} />}</Show>
}

function LockedNotice(props: {login: EngineLogin}): JSX.Element {
  const composerFocus = usePanelComposerFocus()
  const [view, setView] = createStore({loggingIn: false})
  onCleanup(() => {
    if (view.loggingIn) composerFocus?.handle()?.focus()
  })
  return (
    <>
      <StandingNotice
        message={ENGINE_LOCKED_MESSAGE}
        action={{label: 'Log in', run: () => setView('loggingIn', true)}}
      />
      <Show when={view.loggingIn}>
        <EngineLoginDialog trust={props.login.trust()} onClose={() => setView('loggingIn', false)} />
      </Show>
    </>
  )
}
