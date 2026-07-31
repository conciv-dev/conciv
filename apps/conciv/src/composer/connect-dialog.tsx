import {For, Match, Show, Switch, splitProps, type JSX} from 'solid-js'
import {Button, Dialog, RelativeTime} from '@conciv/ui-kit-system'
import type {LiveSession} from '@conciv/contract'
import {TranscriptTailPreview} from './transcript-tail-preview.js'

export type LookingStep = {step: 'looking'}
export type PickingStep = {
  step: 'picking'
  candidates: LiveSession[]
  error: string | null
  retry: LiveSession | null
}
export type ReloadStep = {step: 'reload'; session: LiveSession; command: string; candidates: LiveSession[]}
export type SnippetStep = {step: 'snippet'; command: string; detail: string}

export type ConnectStep = LookingStep | PickingStep | ReloadStep | SnippetStep

const UNTITLED_SESSION = 'Untitled, just started'
export const ONE_TIME_SETUP = 'one-time setup'
export const CONNECTING_LABEL = 'Connecting…'
export const LOOKING_LABEL = 'Looking for running sessions…'
export const RETRY_LABEL = 'Try again'
export const CONTACT_LOST = 'Lost contact with the server. Still trying.'

const ROW = 'flex flex-col gap-1.5 list-none'
const ROW_HEAD =
  'flex flex-col gap-1 items-start w-full text-left py-2 px-2.5 rounded-pw-md [border:none] bg-transparent text-pw-text trans-color-bg'
const ROW_HEAD_IDLE = `${ROW_HEAD} cursor-pointer hover:bg-pw-fill-strong`
const ROW_HEAD_BUSY = `${ROW_HEAD} opacity-60 cursor-progress`
const TITLE_LINE = 'flex items-center gap-2 w-full min-w-0'
const TITLE = 'text-sm font-semibold truncate min-w-0'
const META = 'text-pw-text-3 text-xs w-full truncate'
const DOT_IDLE = 'size-2 rounded-pw-pill bg-pw-text-3 shrink-0'
const DOT_WORKING = 'size-2 rounded-pw-pill bg-pw-success shrink-0 anim-pulse'
const BADGE =
  'shrink-0 px-1.5 py-0.5 rounded-pw-pill text-[0.625rem] font-semibold uppercase tracking-wide text-pw-warn bg-pw-warn-20 border border-pw-warn'
const CODE = 'font-mono text-xs text-pw-text bg-pw-fill rounded-pw-sm py-1.5 px-2 break-all'
const LINK =
  'self-start [border:none] bg-transparent p-0 text-xs text-pw-accent-link cursor-pointer underline underline-offset-2'
const WAITING = 'flex items-center gap-2 text-pw-text-3 text-xs m-0'
const LOST = 'flex items-center gap-2 text-pw-danger text-xs m-0'
const LOST_DOT = 'size-2 rounded-pw-pill bg-pw-danger shrink-0'
const SPINNER = 'size-2 rounded-pw-pill bg-pw-accent anim-pulse shrink-0'
const CONNECTED = 'flex items-center gap-2 text-pw-success text-xs m-0'
const CONNECTED_DOT = 'size-2 rounded-pw-pill bg-pw-success shrink-0'
const CONNECTING = 'flex items-center gap-2 text-pw-accent text-xs'
const FAILURE =
  'flex items-start justify-between gap-2 rounded-pw-sm border border-pw-danger-line bg-pw-danger-10 text-pw-danger text-xs p-2'
const FAILURE_TEXT = 'min-w-0 break-words leading-normal'
const SKELETON = 'flex flex-col gap-3 list-none m-0 p-0'
const SKELETON_ROW = 'h-16 rounded-pw-md bg-pw-fill-soft anim-pulse list-none'
const SKELETON_ROWS = [0, 1]

export function candidateTitle(session: LiveSession): string {
  return session.title.trim() === '' ? UNTITLED_SESSION : session.title
}

function metaLine(session: LiveSession): string {
  const activity = session.working ? 'working' : 'idle'
  const plural = session.messageCount === 1 ? 'message' : 'messages'
  return `${session.name} · ${activity} · ${session.messageCount} ${plural} · active`
}

function subtitle(count: number): string {
  const noun = count === 1 ? 'Claude session is' : 'Claude sessions are'
  return `${count} ${noun} running in this project. Pick the one this panel should follow.`
}

function CandidateRow(props: {
  session: LiveSession
  connecting: string | null
  onPick: (session: LiveSession) => void
}): JSX.Element {
  const busy = () => props.connecting !== null
  const picked = () => props.connecting === props.session.sessionId
  return (
    <li class={ROW}>
      <button
        type="button"
        class={busy() ? ROW_HEAD_BUSY : ROW_HEAD_IDLE}
        disabled={busy()}
        onClick={() => props.onPick(props.session)}
      >
        <span class={TITLE_LINE}>
          <span class={props.session.working ? DOT_WORKING : DOT_IDLE} />
          <span class={TITLE}>{candidateTitle(props.session)}</span>
          <Show when={!props.session.ready}>
            <span class={BADGE}>{ONE_TIME_SETUP}</span>
          </Show>
        </span>
        <span class={META}>
          {metaLine(props.session)} <RelativeTime value={new Date(props.session.lastActivityAt)} />
          <Show when={!props.session.ready}>
            <span> · needs one reload in that terminal</span>
          </Show>
        </span>
        <Show when={picked()}>
          <span class={CONNECTING} role="status">
            <span class={SPINNER} />
            {CONNECTING_LABEL}
          </span>
        </Show>
      </button>
      <TranscriptTailPreview tail={props.session.tail} working={props.session.working} />
    </li>
  )
}

function LookingView(props: {onClose: () => void}): JSX.Element {
  return (
    <>
      <p class={WAITING} role="status">
        <span class={SPINNER} />
        {LOOKING_LABEL}
      </p>
      <ul class={SKELETON} aria-hidden="true">
        <For each={SKELETON_ROWS}>{() => <li class={SKELETON_ROW} />}</For>
      </ul>
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => props.onClose()}>
          Cancel
        </Button>
      </div>
    </>
  )
}

function Failure(props: {message: string; onRetry: () => void}): JSX.Element {
  return (
    <div class={FAILURE} role="alert">
      <span class={FAILURE_TEXT}>{props.message}</span>
      <Button variant="ghost" size="sm" class="shrink-0" onClick={() => props.onRetry()}>
        {RETRY_LABEL}
      </Button>
    </div>
  )
}

function PickingView(props: {
  state: PickingStep
  connecting: string | null
  onPick: (session: LiveSession) => void
  onRetry: () => void
  onClose: () => void
  onLaunch: () => void
}): JSX.Element {
  const empty = () => props.state.candidates.length === 0
  return (
    <>
      <Show when={props.state.error === null}>
        <p class="text-pw-text-3 text-xs leading-normal" role="status">
          {subtitle(props.state.candidates.length)}
        </p>
      </Show>
      <Show when={props.state.error}>{(message) => <Failure message={message()} onRetry={props.onRetry} />}</Show>
      <Show when={!empty()}>
        <ul class="flex flex-col gap-3 list-none m-0 p-0 max-h-[26rem] overflow-y-auto">
          <For each={props.state.candidates}>
            {(session) => <CandidateRow session={session} connecting={props.connecting} onPick={props.onPick} />}
          </For>
        </ul>
      </Show>
      <Show when={empty() && props.state.error === null}>
        <p class="text-pw-text text-sm" role="status">
          No claude session is running in this project.
        </p>
        <p class="text-pw-text-3 text-xs leading-normal">
          Open a new connected session instead, and this panel follows it from the start.
        </p>
      </Show>
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => props.onClose()}>
          Cancel
        </Button>
        <Show when={empty() && props.state.error === null}>
          <Button size="sm" onClick={() => props.onLaunch()}>
            Open a new session
          </Button>
        </Show>
      </div>
    </>
  )
}

function ReloadView(props: {
  state: ReloadStep
  connected: boolean
  contactLost: boolean
  onCopy: (text: string) => void
  onBack: () => void
  onDone: () => void
}): JSX.Element {
  return (
    <>
      <p class="text-pw-text text-sm leading-normal">
        Following <strong>{candidateTitle(props.state.session)}</strong>.
      </p>
      <p class="text-pw-text-3 text-xs leading-normal">
        That session started before conciv was installed, so one step happens in the terminal. Run this there once, and
        never again in this project.
      </p>
      <code class={CODE}>{props.state.command}</code>
      <div class="flex justify-between items-center gap-2">
        <button type="button" class={LINK} onClick={() => props.onBack()}>
          Back to the list
        </button>
        <Button variant="ghost" size="sm" onClick={() => props.onCopy(props.state.command)}>
          Copy command
        </Button>
      </div>
      <Switch>
        <Match when={props.connected}>
          <div class="flex justify-between items-center gap-2">
            <p class={CONNECTED} role="status">
              <span class={CONNECTED_DOT} />
              Connected. Keep talking in either place.
            </p>
            <Button size="sm" onClick={() => props.onDone()}>
              Done
            </Button>
          </div>
        </Match>
        <Match when={props.contactLost}>
          <p class={LOST} role="alert">
            <span class={LOST_DOT} />
            {CONTACT_LOST}
          </p>
        </Match>
        <Match when={!props.connected}>
          <p class={WAITING} role="status">
            <span class={SPINNER} />
            Waiting for the session to dial in. This flips by itself.
          </p>
        </Match>
      </Switch>
    </>
  )
}

function SnippetView(props: {state: SnippetStep; onCopy: (text: string) => void; onClose: () => void}): JSX.Element {
  return (
    <>
      <p class="text-pw-text text-sm leading-normal">{props.state.detail}</p>
      <p class="text-pw-text-3 text-xs leading-normal">
        Quit that session and start it again with this command instead.
      </p>
      <code class={CODE}>{props.state.command}</code>
      <div class="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => props.onCopy(props.state.command)}>
          Copy command
        </Button>
        <Button size="sm" onClick={() => props.onClose()}>
          Close
        </Button>
      </div>
    </>
  )
}

const looking = (state: ConnectStep): LookingStep | undefined => (state.step === 'looking' ? state : undefined)
const picking = (state: ConnectStep): PickingStep | undefined => (state.step === 'picking' ? state : undefined)
const reloading = (state: ConnectStep): ReloadStep | undefined => (state.step === 'reload' ? state : undefined)
const snippet = (state: ConnectStep): SnippetStep | undefined => (state.step === 'snippet' ? state : undefined)

export function ConnectSessionDialog(props: {
  state: ConnectStep | null
  onPick: (session: LiveSession) => void
  onCopy: (text: string) => void
  onClose: () => void
  onLaunch: () => void
  onBack: (candidates: LiveSession[]) => void
  onDone: (session: LiveSession) => void
  onRetry: () => void
  connected: boolean
  connecting: string | null
  contactLost: boolean
}): JSX.Element {
  const [local] = splitProps(props, [
    'state',
    'onPick',
    'onCopy',
    'onClose',
    'onLaunch',
    'onBack',
    'onDone',
    'onRetry',
    'connected',
    'connecting',
    'contactLost',
  ])
  return (
    <Dialog
      open={local.state !== null}
      onOpenChange={() => local.onClose()}
      dismissable
      size="lg"
      title="Connect a running session"
    >
      <Show when={local.state}>
        {(state) => (
          <div class="flex flex-col gap-3">
            <Switch>
              <Match when={looking(state())}>
                <LookingView onClose={local.onClose} />
              </Match>
              <Match when={picking(state())}>
                {(value) => (
                  <PickingView
                    state={value()}
                    connecting={local.connecting}
                    onPick={local.onPick}
                    onRetry={local.onRetry}
                    onClose={local.onClose}
                    onLaunch={local.onLaunch}
                  />
                )}
              </Match>
              <Match when={reloading(state())}>
                {(value) => (
                  <ReloadView
                    state={value()}
                    connected={local.connected}
                    contactLost={local.contactLost}
                    onCopy={local.onCopy}
                    onBack={() => local.onBack(value().candidates)}
                    onDone={() => local.onDone(value().session)}
                  />
                )}
              </Match>
              <Match when={snippet(state())}>
                {(value) => <SnippetView state={value()} onCopy={local.onCopy} onClose={local.onClose} />}
              </Match>
            </Switch>
          </div>
        )}
      </Show>
    </Dialog>
  )
}
