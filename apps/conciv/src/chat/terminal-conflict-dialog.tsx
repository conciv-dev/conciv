import {Match, Show, Switch, splitProps, type JSX} from 'solid-js'
import {Button, Dialog} from '@conciv/ui-kit-system'
import type {Conflict} from './conflict.js'

const BODY = 'text-pw-text text-sm leading-normal m-0'
const HINT = 'text-pw-text-3 text-xs leading-normal m-0'
const ALARM = 'text-pw-danger text-xs leading-normal m-0'
const RING = 'focus-ring-always'

const TAKE_OVER_QUESTION = 'Take the session back from your terminal?'
const SEND_QUESTION = 'Send it here anyway?'
const STILL_LIVE_QUESTION = 'Handed back — but your terminal is still working on this conversation. Send anyway?'
const KEPT_HINT = 'Your message is still in the composer.'
const TAKE_OVER_LABEL = 'Take over'
const TAKING_OVER_LABEL = 'Taking over…'
const SEND_ANYWAY_LABEL = 'Send anyway'
const RETRY_LABEL = 'Try again'
const CANCEL_LABEL = 'Cancel'
const CLOSE_LABEL = 'OK'
const BUSY_TITLE = 'Your terminal is busy'
const ACTIVE_TITLE = 'Terminal session is active'

function messageOf(conflict: Conflict): string {
  return conflict.kind === 'none' ? '' : conflict.message
}

function labelOf(conflict: Conflict): string {
  return conflict.kind === 'blocked' ? BUSY_TITLE : ACTIVE_TITLE
}

function ChoiceRow(props: {
  dismissRef: (element: HTMLButtonElement) => void
  onCancel: () => void
  children: JSX.Element
}): JSX.Element {
  const [local] = splitProps(props, ['dismissRef', 'onCancel', 'children'])
  return (
    <div class="flex justify-end gap-2">
      <Button ref={local.dismissRef} class={RING} variant="ghost" size="sm" onClick={() => local.onCancel()}>
        {CANCEL_LABEL}
      </Button>
      {local.children}
    </div>
  )
}

export function TerminalConflictDialog(props: {
  conflict: Conflict
  onCancel: () => void
  onTakeOver: () => void
  onSendAnyway: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['conflict', 'onCancel', 'onTakeOver', 'onSendAnyway'])
  const busy = () => local.conflict.kind === 'taking-over'
  const failure = () => (local.conflict.kind === 'take-over-failed' ? local.conflict.reason : null)
  const sending = () => local.conflict.kind === 'still-live' || local.conflict.kind === 'external'
  let dismiss: HTMLButtonElement | undefined
  const keepDismiss = (element: HTMLButtonElement) => {
    dismiss = element
  }
  return (
    <Dialog
      open={local.conflict.kind !== 'none'}
      onOpenChange={() => local.onCancel()}
      dismissable
      role="alertdialog"
      initialFocus={() => dismiss ?? null}
      label={labelOf(local.conflict)}
    >
      <div class="flex flex-col gap-3" aria-busy={busy()}>
        <p class={BODY}>{messageOf(local.conflict)}</p>
        <Show when={failure()}>
          {(reason) => (
            <p class={ALARM} role="alert">
              Couldn’t take it back: {reason()}
            </p>
          )}
        </Show>
        <Switch>
          <Match when={local.conflict.kind === 'blocked'}>
            <p class={HINT}>{KEPT_HINT}</p>
            <div class="flex justify-end">
              <Button ref={keepDismiss} class={RING} size="sm" onClick={() => local.onCancel()}>
                {CLOSE_LABEL}
              </Button>
            </div>
          </Match>
          <Match when={sending()}>
            <p class={HINT}>{local.conflict.kind === 'still-live' ? STILL_LIVE_QUESTION : SEND_QUESTION}</p>
            <ChoiceRow dismissRef={keepDismiss} onCancel={() => local.onCancel()}>
              <Button class={RING} size="sm" onClick={() => local.onSendAnyway()}>
                {SEND_ANYWAY_LABEL}
              </Button>
            </ChoiceRow>
          </Match>
          <Match when={true}>
            <p class={HINT}>{TAKE_OVER_QUESTION}</p>
            <ChoiceRow dismissRef={keepDismiss} onCancel={() => local.onCancel()}>
              <Button class={RING} size="sm" disabled={busy()} aria-busy={busy()} onClick={() => local.onTakeOver()}>
                <Switch fallback={TAKE_OVER_LABEL}>
                  <Match when={busy()}>{TAKING_OVER_LABEL}</Match>
                  <Match when={failure()}>{RETRY_LABEL}</Match>
                </Switch>
              </Button>
            </ChoiceRow>
          </Match>
        </Switch>
      </div>
    </Dialog>
  )
}
