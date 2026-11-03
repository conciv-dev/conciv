import {untrack, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {consumeOtpFromUrl} from 'devframe/client'
import {browserClient} from '@conciv/extension/devframe-connection'
import {PAGE_QUERY_FUNCTION} from '@conciv/protocol/page-types'
import {Button, Dialog, PinInput} from '@conciv/ui-kit-system'
import {resolveHubBase} from '../lib/api-base.js'

declare module 'devframe/types' {
  interface DevframeRpcServerFunctions {
    'conciv:engine-access': () => Promise<string>
  }
}

export type HubConnection = ReturnType<typeof browserClient>
type HubClient = Awaited<ReturnType<HubConnection['ready']>>

type LoginPhase = 'checking' | 'unreachable' | 'locked' | 'exchanging' | 'trusted'
type LoginNotice = 'none' | 'mismatch' | 'newCode' | 'failed' | 'requestFailed'
type LoginState = {phase: LoginPhase; dialogOpen: boolean; notice: LoginNotice}

export type HubLogin = {
  state: LoginState
  awaitingCode: () => boolean
  request: (open: () => void) => void
  close: () => void
  edit: () => void
  submit: (code: string) => Promise<boolean>
  reissue: () => void
  dispose: () => void
}

const HUB_PATH = '/__conciv/'
const DEVTOOLS_HUB_PATH = '/__devtools/'
const ENGINE_ACCESS = 'conciv:engine-access'
const TOKEN_SEGMENT = /\/t\/([^/]+)/
const CODE_LENGTH = 6

const NOTICE_TEXT: Record<Exclude<LoginNotice, 'none'>, string> = {
  mismatch: "That code didn't match. Check your terminal and try again.",
  newCode: 'A new code was printed in your terminal.',
  failed: 'Something went wrong while authorizing. Please try again.',
  requestFailed: 'Could not request a new code. Please try again.',
}

export function tokenOf(apiBase: string): string | undefined {
  return TOKEN_SEGMENT.exec(new URL(apiBase, window.location.href).pathname)?.[1]
}

export function tokenBearingApiBase(apiBase: string): string | null {
  return tokenOf(apiBase) === undefined ? null : apiBase
}

export function hubBaseOf(apiBase: string): string {
  return `${resolveHubBase(new URL(apiBase, window.location.href).origin)}${HUB_PATH}`
}

async function joinPage(client: HubClient, sessionId: string, signal: AbortSignal): Promise<void> {
  if (!(await client.ensureTrusted(0)) || signal.aborted) return
  const page = client.scope('conciv').rpc
  await page.call('conciv:page:join', {sessionId})
  if (signal.aborted) await page.call('conciv:page:leave', {sessionId})
}

export function servePage(
  hub: HubConnection,
  sessionId: string,
  answer: (query: unknown) => Promise<unknown>,
): () => void {
  const serving = new AbortController()
  const offClient = hub.onClient((client) => {
    client.client.register({name: PAGE_QUERY_FUNCTION, type: 'action', handler: answer}, true)
    joinPage(client, sessionId, serving.signal).catch((error: unknown) => {
      if (!serving.signal.aborted) console.error(`conciv: joining the page to session ${sessionId} failed`, error)
    })
  })
  hub.ready().catch((error: unknown) => {
    if (!serving.signal.aborted) console.error(`conciv: the hub connection for session ${sessionId} failed`, error)
  })
  return () => {
    offClient()
    serving.abort()
    if (hub.status() !== 'connected') return
    hub
      .ready()
      .then((client) => client.scope('conciv').rpc.call('conciv:page:leave', {sessionId}))
      .catch(() => {})
  }
}

export function hubFor(apiBase: string): HubConnection {
  return browserClient({baseURL: hubBaseOf(apiBase), authToken: tokenOf(apiBase)})
}

export function devtoolsHub(): HubConnection {
  return browserClient({baseURL: new URL(DEVTOOLS_HUB_PATH, window.location.href).href})
}

export function makeHubLogin(
  hub: HubConnection,
  apiBase: string,
  onTrusted: (trustedApiBase: string) => Promise<void>,
  engineAccess: boolean,
): HubLogin {
  const origin = new URL(apiBase, window.location.href).origin
  const [state, setState] = createStore<LoginState>({phase: 'checking', dialogOpen: false, notice: 'none'})
  const pending: {open: (() => void) | null} = {open: null}
  const runPending = (): void => {
    const requested = pending.open
    pending.open = null
    requested?.()
  }

  const trust = (token: string): void => {
    setState({phase: 'trusted', dialogOpen: false, notice: 'none'})
    void onTrusted(`${origin}/t/${token}`).then(runPending, runPending)
  }

  const lock = (): void => {
    setState('phase', 'locked')
    if (pending.open && !untrack(() => state.dialogOpen)) showDialog()
  }

  const accept = (client: HubClient): void => {
    const token = client.connection.authToken
    if (!engineAccess) {
      if (token) trust(token)
      else lock()
      return
    }
    client.call(ENGINE_ACCESS).then(trust, () => {
      setState('phase', 'unreachable')
      runPending()
    })
  }

  const followTrust =
    (client: HubClient) =>
    (trusted: boolean | null): void => {
      if (state.phase === 'exchanging') return
      if (trusted) accept(client)
      else lock()
    }

  const unsubscribe = {trust: (): void => {}}
  const offStatus = hub.onStatus((status) => {
    if (status !== 'disconnected' || untrack(() => state.phase) !== 'checking') return
    setState('phase', 'unreachable')
    runPending()
  })
  const offClient = hub.onClient((client) => {
    unsubscribe.trust()
    unsubscribe.trust = client.events.on('rpc:is-trusted:updated', followTrust(client))
    if (client.isTrusted) followTrust(client)(true)
  })

  const exchange = async (code: string): Promise<boolean> => {
    setState({phase: 'exchanging', notice: 'none'})
    const client = await hub.ready()
    const trusted = await client.requestTrustWithCode(code)
    if (trusted && (engineAccess || client.connection.authToken)) {
      accept(client)
      return true
    }
    setState({phase: 'locked', notice: 'mismatch'})
    return false
  }

  const submit = (code: string): Promise<boolean> =>
    exchange(code).catch(() => {
      setState({phase: 'locked', notice: 'failed'})
      return false
    })

  const requestCode = (reissue: boolean): void => {
    hub
      .ready()
      .then((client) => client.requestAuthCode({reissue}))
      .then(
        () => {
          if (reissue) setState('notice', 'newCode')
        },
        () => setState('notice', 'requestFailed'),
      )
  }

  const showDialog = (): void => {
    setState({dialogOpen: true, notice: 'none'})
    requestCode(false)
  }

  hub.ready().catch(() => {
    setState('phase', 'unreachable')
    runPending()
  })
  const otp = consumeOtpFromUrl()
  if (otp) void submit(otp)

  return {
    state,
    awaitingCode: () => state.phase === 'locked' || state.phase === 'exchanging',
    request: (open) => {
      if (state.phase === 'trusted' || state.phase === 'unreachable') {
        open()
        return
      }
      pending.open = open
      if (state.phase === 'checking') return
      showDialog()
    },
    close: () => {
      pending.open = null
      setState('dialogOpen', false)
    },
    edit: () => {
      if (state.notice === 'mismatch') setState('notice', 'none')
    },
    submit,
    reissue: () => requestCode(true),
    dispose: () => {
      offClient()
      offStatus()
      unsubscribe.trust()
    },
  }
}

export function AuthorizeDialog(props: {login: HubLogin}): JSX.Element {
  const notice = (): string | undefined => {
    const current = props.login.state.notice
    return current === 'none' ? undefined : NOTICE_TEXT[current]
  }
  const alerting = (): boolean => props.login.state.notice !== 'none' && props.login.state.notice !== 'newCode'
  return (
    <div class="font-chat text-chat-text">
      <Dialog
        title="Authorize conciv"
        open={props.login.state.dialogOpen}
        onOpenChange={(open) => {
          if (!open) props.login.close()
        }}
        dismissable
        footer={
          <div class="flex items-center justify-between gap-3">
            <Button variant="link" size="bare" class="min-h-11" onClick={() => props.login.reissue()}>
              Send a new code
            </Button>
            <Button variant="outline" onClick={() => props.login.close()}>
              Close
            </Button>
          </div>
        }
      >
        <div class="flex flex-col gap-3">
          <p class="text-sm text-chat-text-2 m-0">
            conciv can access your server, read your filesystem, and run commands. Confirm it's you before continuing.
          </p>
          <p class="text-sm text-chat-text m-0">Find the 6-digit code printed in your terminal.</p>
          <PinInput
            label="Enter your one-time authorization code"
            length={CODE_LENGTH}
            invalid={props.login.state.notice === 'mismatch'}
            digitLabel={(position, length) => `Digit ${position} of ${length}`}
            onValueChange={(value) => {
              if (value.some((digit) => digit !== '')) props.login.edit()
            }}
            onValueComplete={(code, controls) =>
              void props.login.submit(code).then((trusted) => {
                if (!trusted) controls.clear()
              })
            }
          />
          <div class="grid min-h-[2lh] text-sm">
            <p role="alert" class="[grid-area:1/1] text-chat-danger m-0">
              {alerting() ? notice() : ''}
            </p>
            <p role="status" class="[grid-area:1/1] text-chat-text-2 m-0">
              {alerting() ? '' : notice()}
            </p>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
