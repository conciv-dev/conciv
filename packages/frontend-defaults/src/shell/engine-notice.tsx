import {Show, createEffect, onCleanup, onMount, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {isReachabilityError, useQuery, type EngineConnection} from '@conciv/client'
import {useChildMatches, useRouteContext, useRouter} from '@tanstack/solid-router'
import lt from 'semver/functions/lt'
import valid from 'semver/functions/valid'
import {version as appVersion} from '../../package.json' with {type: 'json'}
import {useApiBase, useAppData, useConnected} from '../app/context.js'
import {useEngineReachability} from '../app/reachability.js'
import {useNotices} from './notice-context.js'
import {StandingNotice} from './notices.js'
import {EngineLoginDialog, type EngineLogin} from '../app/engine-login.js'
import {usePanelComposerFocus} from '../app/panel-focus.js'
import {lockedMessage} from './engine-lock-messages.js'

const ENGINE_STALE_MESSAGE =
  'Engine is running outdated code: the server code on disk is newer than the running engine. Restart the dev server.'

const ENGINE_OUTDATED_MESSAGE = `This widget is version ${appVersion} but the conciv engine is older. Update your @conciv packages to ${appVersion}, then restart your dev server.`

const ENGINE_UNREACHABLE_KEY = 'engine-unreachable'
const ENGINE_UNREACHABLE_MESSAGE = 'conciv lost connection to the engine.'

export function EngineStaleNotice(): JSX.Element {
  const appData = useAppData()
  const connected = useConnected()
  const notices = useNotices()
  const engine = useQuery(() => ({
    ...appData.utils.meta.engine.queryOptions(),
    enabled: connected(),
    refetchOnReconnect: 'always',
  }))
  const standing = {fingerprint: null as string | null}
  const clear = (): void => {
    if (standing.fingerprint === null) return
    notices.remove(standing.fingerprint)
    standing.fingerprint = null
  }
  onCleanup(clear)
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

export function EngineOutdatedNotice(): JSX.Element {
  const apiBase = useApiBase()
  const connection = useRouteContext({strict: false, select: (context) => context.connection})
  const connected = useConnected()
  const engineVersion = useQuery(() => engineVersionQueryOptions(apiBase(), connection()?.(), connected()))
  const outdated = (): boolean => engineVersion.isSuccess && engineOlderThanWidget(engineVersion.data)
  return (
    <Show when={outdated()}>
      <StandingNotice message={ENGINE_OUTDATED_MESSAGE} />
    </Show>
  )
}

export function engineVersionQueryOptions(
  apiBase: string,
  connection: EngineConnection | undefined,
  connected: boolean,
) {
  return {
    queryKey: ['conciv', 'engine-version', apiBase],
    enabled: connected && connection !== undefined,
    queryFn: () => connection?.version() ?? Promise.resolve(null),
  }
}

export function engineOlderThanWidget(version: string | null): boolean {
  const engine = version === null ? null : valid(version)
  return engine === null || lt(engine, appVersion)
}

export function EngineUnreachableNotice(): JSX.Element {
  const reachability = useEngineReachability()
  const notices = useNotices()
  const connection = useRouteContext({strict: false, select: (context) => context.connection})
  const router = useRouter()
  const login = useRouteContext({strict: false, select: (context) => context.login})
  const errorScreenShowsUnreachable = useChildMatches({
    select: (matches) => matches.some((match) => match.status === 'error' && isReachabilityError(match.error)),
  })
  const retry = async (): Promise<void> => {
    connection()?.()?.reset()
    await login()?.requestTrust()
    await router.invalidate()
  }
  onCleanup(() => notices.remove(ENGINE_UNREACHABLE_KEY))
  createEffect(() => {
    if (!reachability.sustainedOffline() || errorScreenShowsUnreachable()) {
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
  const reachability = useEngineReachability()
  const lockedLogin = (): EngineLogin | undefined => {
    const current = login()
    return current !== undefined && reachability.locked() !== null ? current : undefined
  }
  return (
    <Show when={lockedLogin()}>
      {(current) => <LockedNotice login={current()} message={lockedMessage(reachability.locked()) ?? ''} />}
    </Show>
  )
}

function LockedNotice(props: {login: EngineLogin; message: string}): JSX.Element {
  const composerFocus = usePanelComposerFocus()
  const [view, setView] = createStore({loggingIn: false})
  const composerHeldFocus = composerFocus?.handle()?.focused() === true
  let logIn: HTMLButtonElement | undefined
  onMount(() => {
    if (composerHeldFocus) logIn?.focus({focusVisible: true})
  })
  onCleanup(() => {
    if (view.loggingIn) composerFocus?.handle()?.focus()
  })
  return (
    <>
      <StandingNotice
        message={props.message}
        action={{label: 'Log in', run: () => setView('loggingIn', true)}}
        actionRef={(button) => {
          logIn = button
        }}
      />
      <Show when={view.loggingIn}>
        <EngineLoginDialog trust={props.login.trust()} onClose={() => setView('loggingIn', false)} />
      </Show>
    </>
  )
}
