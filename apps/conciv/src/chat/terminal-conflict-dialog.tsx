import {Match, Show, Switch, splitProps, type JSX} from 'solid-js'
import {Button, Dialog} from '@conciv/ui-kit-system'
import type {Conflict} from './conflict.js'

const BODY = 'text-pw-text text-sm leading-normal m-0'
const HINT = 'text-pw-text-3 text-xs leading-normal m-0'
const ALARM = 'text-pw-danger text-xs leading-normal m-0'

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

export function TerminalConflictDialog(props: {
  conflict: Conflict
  onCancel: () => void
  onTakeOver: () => void
  onSendAnyway: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['conflict', 'onCancel', 'onTakeOver', 'onSendAnyway'])
  const busy = () => local.conflict.kind === 'taking-over'
  const failure = () => (local.conflict.kind === 'take-over-failed' ? local.conflict.reason : null)
  let dismiss: HTMLButtonElement | undefined
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
              <Button
                ref={(element: HTMLButtonElement) => {
                  dismiss = element
                }}
                size="sm"
                onClick={() => local.onCancel()}
              >
                {CLOSE_LABEL}
              </Button>
            </div>
          </Match>
          <Match when={local.conflict.kind === 'still-live'}>
            <p class={HINT}>{STILL_LIVE_QUESTION}</p>
            <div class="flex justify-end gap-2">
              <Button
                ref={(element: HTMLButtonElement) => {
                  dismiss = element
                }}
                variant="ghost"
                size="sm"
                onClick={() => local.onCancel()}
              >
                {CANCEL_LABEL}
              </Button>
              <Button size="sm" onClick={() => local.onSendAnyway()}>
                {SEND_ANYWAY_LABEL}
              </Button>
            </div>
          </Match>
          <Match when={local.conflict.kind === 'external'}>
            <p class={HINT}>{SEND_QUESTION}</p>
            <div class="flex justify-end gap-2">
              <Button
                ref={(element: HTMLButtonElement) => {
                  dismiss = element
                }}
                variant="ghost"
                size="sm"
                onClick={() => local.onCancel()}
              >
                {CANCEL_LABEL}
              </Button>
              <Button size="sm" onClick={() => local.onSendAnyway()}>
                {SEND_ANYWAY_LABEL}
              </Button>
            </div>
          </Match>
          <Match when={true}>
            <p class={HINT}>{TAKE_OVER_QUESTION}</p>
            <div class="flex justify-end gap-2">
              <Button
                ref={(element: HTMLButtonElement) => {
                  dismiss = element
                }}
                variant="ghost"
                size="sm"
                onClick={() => local.onCancel()}
              >
                {CANCEL_LABEL}
              </Button>
              <Button size="sm" disabled={busy()} aria-busy={busy()} onClick={() => local.onTakeOver()}>
                <Switch fallback={TAKE_OVER_LABEL}>
                  <Match when={busy()}>{TAKING_OVER_LABEL}</Match>
                  <Match when={failure()}>{RETRY_LABEL}</Match>
                </Switch>
              </Button>
            </div>
          </Match>
        </Switch>
      </div>
    </Dialog>
  )
}
