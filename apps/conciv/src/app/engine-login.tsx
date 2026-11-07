import {createMemo, from, onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {
  browserRpcConnection,
  consumeMagicLinkCode,
  type EngineTokenSource,
  type EngineTrust,
  type TrustStatus,
} from '@conciv/contract'
import {Button, Dialog, PinInput} from '@conciv/ui-kit-system'
import {useLayers} from './context.js'

export type EngineLogin = {
  trust: Accessor<EngineTrust>
  status: Accessor<TrustStatus>
  requestTrust: () => Promise<boolean>
}

type LoginNotice = 'none' | 'mismatch' | 'expired' | 'newCode' | 'failed' | 'requestFailed'

const CODE_LENGTH = 6

const NOTICE_TEXT: Record<Exclude<LoginNotice, 'none'>, string> = {
  mismatch: "That code didn't match. Check your terminal and try again.",
  expired: 'That code expired. Send a new code and use the one your terminal prints.',
  newCode: 'A new code was printed in your terminal.',
  failed: 'Something went wrong while authorizing. Please try again.',
  requestFailed: 'Could not ask the dev server for a code. Please try again.',
}

function trustStatus(trust: EngineTrust): Accessor<TrustStatus> {
  return from<TrustStatus>((set) => trust.subscribe((status) => set(status)), trust.status())
}

export function createEngineLogin(options: {apiBase: Accessor<string>; tokenSource?: EngineTokenSource}): EngineLogin {
  const trust = createMemo(() => browserRpcConnection(options.apiBase()).trust)
  const status = createMemo(() => trustStatus(trust()))
  return {
    trust,
    status: () => status()(),
    requestTrust: () => trust().requestTrust(options.tokenSource),
  }
}

export function engineConnected(status: TrustStatus): boolean {
  return status === 'trusted' || status === 'unreachable'
}

export function engineLocked(status: TrustStatus): boolean {
  return status === 'untrusted' || status === 'revoked'
}

export async function startEngineLogin(login: EngineLogin): Promise<boolean> {
  const code = consumeMagicLinkCode()
  const trust = login.trust()
  if (await trust.requestTrust()) return true
  if (trust.status() === 'unreachable') return false
  if (code !== undefined) {
    const exchanged = await trust.requestTrustWithCode(code).catch((error: unknown) => {
      console.error('[conciv] the magic link code exchange failed', error)
      return null
    })
    if (exchanged !== null && 'token' in exchanged) return true
  }
  return login.requestTrust()
}

export function EngineLoginDialog(props: {trust: EngineTrust; onClose: () => void}): JSX.Element {
  const [view, setView] = createStore<{notice: LoginNotice}>({notice: 'none'})
  onCleanup(useLayers().register(() => true, false))
  const requestCode = (reissue: boolean): void => {
    props.trust
      .requestAuthCode({reissue})
      .then(() => {
        if (reissue) setView('notice', 'newCode')
      })
      .catch((error: unknown) => {
        console.error('[conciv] could not ask the dev server for a login code', error)
        setView('notice', 'requestFailed')
      })
  }
  onMount(() => requestCode(false))
  const submit = (code: string, clear: () => void): void => {
    setView('notice', 'none')
    props.trust
      .requestTrustWithCode(code)
      .then((result) => {
        if ('token' in result) return
        setView('notice', result.refused)
        clear()
      })
      .catch((error: unknown) => {
        console.error('[conciv] the code exchange failed', error)
        setView('notice', 'failed')
        clear()
      })
  }
  const notice = (): string => (view.notice === 'none' ? '' : NOTICE_TEXT[view.notice])
  const alerting = (): boolean => view.notice !== 'none' && view.notice !== 'newCode'
  return (
    <div class="font-chat text-chat-text">
      <Dialog
        title="Authorize conciv"
        open
        onOpenChange={(open) => {
          if (!open) props.onClose()
        }}
        dismissable
        footer={
          <div class="flex items-center justify-between gap-3">
            <Button variant="link" size="bare" class="min-h-11" onClick={() => requestCode(true)}>
              Send a new code
            </Button>
            <Button variant="outline" onClick={() => props.onClose()}>
              Close
            </Button>
          </div>
        }
      >
        <div class="flex flex-col gap-3">
          <p class="text-sm text-chat-text-2 m-0">
            conciv can read your project, run commands and open your editor. Confirm it's you before continuing.
          </p>
          <p class="text-sm text-chat-text m-0">
            Enter the 6-digit code printed in the terminal running your dev server.
          </p>
          <PinInput
            label="One-time authorization code"
            length={CODE_LENGTH}
            invalid={view.notice === 'mismatch'}
            digitLabel={(position, length) => `Digit ${position} of ${length}`}
            onValueChange={(value) => {
              if (view.notice !== 'none' && value.some((digit) => digit !== '')) setView('notice', 'none')
            }}
            onValueComplete={(code, controls) => submit(code, controls.clear)}
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
