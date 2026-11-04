import {createMemo, createResource, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {z} from 'zod'
import {makeEventListener} from '@solid-primitives/event-listener'
import {RPC_UNAUTHORIZED_EVENT} from '@conciv/contract'
import {Button, Dialog, PinInput, readStorage, writeStorage} from '@conciv/ui-kit-system'

export type LoginPhase = 'checking' | 'unreachable' | 'locked' | 'exchanging' | 'trusted'

type LoginNotice = 'none' | 'mismatch' | 'expired' | 'newCode' | 'failed' | 'requestFailed'

type Attempt = {kind: 'resume'} | {kind: 'code'; code: string}

type Outcome = {phase: 'trusted'; token: string} | {phase: 'locked'; notice: LoginNotice} | {phase: 'unreachable'}

type LoginUi = {attempt: Attempt; dialogOpen: boolean; requestNotice: LoginNotice; edited: boolean}

export type EngineLogin = {
  phase: () => LoginPhase
  apiBase: () => string | null
  ready: Promise<void>
  dialogOpen: () => boolean
  notice: () => LoginNotice
  request: (open: () => void) => void
  recheck: () => Promise<void>
  close: () => void
  edit: () => void
  submit: (code: string) => Promise<boolean>
  reissue: () => void
}

export type EngineLoginOptions = {apiBase: string; tokenSource?: () => Promise<string>}

const TOKEN_SEGMENT = /^(.*?)\/t\/([^/]+)\/?$/
const MAGIC_LINK = /^#conciv_otp=(\d{6})$/
const STORAGE_PREFIX = 'conciv:engine-token:'
const REQUEST_TIMEOUT_MS = 5000
const CODE_LENGTH = 6

const CheckSchema = z.object({trusted: z.boolean()})
const TokenSchema = z.object({token: z.string().min(1)})
const RefusalSchema = z.object({reason: z.enum(['mismatch', 'expired'])})

const NOTICE_TEXT: Record<Exclude<LoginNotice, 'none'>, string> = {
  mismatch: "That code didn't match. Check your terminal and try again.",
  expired: 'That code expired. Send a new code and use the one your terminal prints.',
  newCode: 'A new code was printed in your terminal.',
  failed: 'Something went wrong while authorizing. Please try again.',
  requestFailed: 'Could not ask the dev server for a code. Please try again.',
}

function engineRoot(apiBase: string): {root: string; token: string | undefined} {
  const url = new URL(apiBase, window.location.href)
  const path = url.pathname.replace(/\/$/, '')
  const match = TOKEN_SEGMENT.exec(path)
  return match
    ? {root: `${url.origin}${match[1] ?? ''}`, token: match[2]}
    : {root: `${url.origin}${path}`, token: undefined}
}

function takeMagicLinkCode(): string | undefined {
  const code = MAGIC_LINK.exec(window.location.hash)?.[1]
  if (code === undefined) return undefined
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
  return code
}

export function createEngineLogin(options: EngineLoginOptions): EngineLogin {
  const engine = engineRoot(options.apiBase)
  const storageKey = `${STORAGE_PREFIX}${engine.root}`
  const magicCode = takeMagicLinkCode()
  const [ui, setUi] = createStore<LoginUi>({
    attempt: magicCode === undefined ? {kind: 'resume'} : {kind: 'code', code: magicCode},
    dialogOpen: false,
    requestNotice: 'none',
    edited: false,
  })
  const pending: {open: (() => void) | null} = {open: null}

  const post = (path: string, body: unknown): Promise<Response> =>
    fetch(`${engine.root}${path}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

  const sourcedToken = async (): Promise<string | undefined> => {
    if (!options.tokenSource) return undefined
    return options.tokenSource().catch((error: unknown) => {
      console.error('[conciv] the host could not provide an engine token', error)
      return undefined
    })
  }

  const trusts = async (token: string): Promise<boolean> =>
    CheckSchema.parse(await (await post('/auth/check', {token})).json()).trusted

  const resume = async (): Promise<Outcome> => {
    const stored = readStorage<string | undefined>(storageKey, (raw) => raw, undefined)
    const candidates = [engine.token, await sourcedToken(), stored].filter((token) => token !== undefined)
    if (candidates.length === 0) await fetch(`${engine.root}/health`, {signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)})
    for (const token of candidates) {
      if (!(await trusts(token))) continue
      if (token !== engine.token) writeStorage(storageKey, token)
      return {phase: 'trusted', token}
    }
    if (stored !== undefined) writeStorage(storageKey, undefined)
    return {phase: 'locked', notice: 'none'}
  }

  const exchange = async (code: string): Promise<Outcome> => {
    const body: unknown = await (await post('/auth/exchange', {code})).json()
    const granted = TokenSchema.safeParse(body)
    if (granted.success) {
      writeStorage(storageKey, granted.data.token)
      return {phase: 'trusted', token: granted.data.token}
    }
    const refusal = RefusalSchema.safeParse(body)
    return {phase: 'locked', notice: refusal.success ? refusal.data.reason : 'failed'}
  }

  const run = (attempt: Attempt): Promise<Outcome> => {
    if (attempt.kind === 'code') {
      return exchange(attempt.code).catch((error: unknown) => {
        console.error('[conciv] the code exchange failed', error)
        return {phase: 'locked', notice: 'failed'}
      })
    }
    return resume().catch((error: unknown) => {
      console.error('[conciv] the dev server did not answer the login check', error)
      return {phase: 'unreachable'}
    })
  }

  const latest: {run: Promise<Outcome>} = {run: Promise.resolve({phase: 'unreachable'})}
  const [outcome, {refetch}] = createResource<Outcome>(() => {
    latest.run = run(ui.attempt)
    return latest.run
  })

  const requestCode = (reissue: boolean): void => {
    post('/auth/code', {reissue})
      .then((response) => {
        if (!response.ok) throw new Error(`the dev server answered HTTP ${response.status}`)
        if (reissue) setUi({requestNotice: 'newCode', edited: false})
      })
      .catch((error: unknown) => {
        console.error('[conciv] could not ask the dev server for a login code', error)
        setUi('requestNotice', 'requestFailed')
      })
  }

  const showDialog = (): void => {
    setUi({dialogOpen: true, requestNotice: 'none', edited: false})
    requestCode(false)
  }

  const settle = (result: Outcome): void => {
    if (result.phase === 'locked') {
      if (pending.open && !ui.dialogOpen) showDialog()
      return
    }
    setUi('dialogOpen', false)
    const open = pending.open
    pending.open = null
    open?.()
  }

  const ready = latest.run.then(settle)

  const phase = createMemo<LoginPhase>(() => {
    if (outcome.loading && ui.attempt.kind === 'code') return 'exchanging'
    return outcome.latest?.phase ?? 'checking'
  })

  const apiBase = createMemo<string | null>(() => {
    const current = outcome.latest
    if (current?.phase === 'trusted') return `${engine.root}/t/${current.token}`
    if (current?.phase === 'unreachable')
      return engine.token === undefined ? engine.root : `${engine.root}/t/${engine.token}`
    return null
  })

  const notice = createMemo<LoginNotice>(() => {
    if (ui.requestNotice !== 'none') return ui.requestNotice
    const current = outcome.loading ? undefined : outcome()
    if (ui.edited || current?.phase !== 'locked') return 'none'
    return current.notice
  })

  const submit = async (code: string): Promise<boolean> => {
    const attempt: Attempt = {kind: 'code', code}
    setUi({attempt, requestNotice: 'none', edited: false})
    await refetch()
    const result = await latest.run
    setUi('edited', false)
    settle(result)
    return result.phase === 'trusted'
  }

  const recheck = async (): Promise<void> => {
    if (outcome.loading) return
    setUi('attempt', {kind: 'resume'})
    await refetch()
    settle(await latest.run)
  }

  makeEventListener(window, RPC_UNAUTHORIZED_EVENT, () => {
    if (phase() === 'trusted') void recheck()
  })

  return {
    phase,
    apiBase,
    ready,
    dialogOpen: () => ui.dialogOpen,
    notice,
    request: (open) => {
      const current = phase()
      if (current === 'trusted' || current === 'unreachable') {
        open()
        return
      }
      pending.open = open
      if (current === 'locked' && !ui.dialogOpen) showDialog()
    },
    recheck,
    close: () => {
      pending.open = null
      setUi('dialogOpen', false)
    },
    edit: () => {
      if (!ui.edited) setUi({edited: true, requestNotice: 'none'})
    },
    submit,
    reissue: () => requestCode(true),
  }
}

export function EngineLoginDialog(props: {login: EngineLogin}): JSX.Element {
  const notice = (): string => {
    const current = props.login.notice()
    return current === 'none' ? '' : NOTICE_TEXT[current]
  }
  const alerting = (): boolean => !['none', 'newCode'].includes(props.login.notice())
  return (
    <div class="font-chat text-chat-text">
      <Dialog
        title="Authorize conciv"
        open={props.login.dialogOpen()}
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
            conciv can read your project, run commands and open your editor. Confirm it's you before continuing.
          </p>
          <p class="text-sm text-chat-text m-0">
            Enter the 6-digit code printed in the terminal running your dev server.
          </p>
          <PinInput
            label="One-time authorization code"
            length={CODE_LENGTH}
            invalid={props.login.notice() === 'mismatch'}
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
