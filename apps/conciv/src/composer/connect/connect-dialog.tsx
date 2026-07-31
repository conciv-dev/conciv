import {Match, Show, Switch, createEffect, createSignal, splitProps, type JSX} from 'solid-js'
import {Button, Dialog, RelativeTime, TooltipIconButton} from '@conciv/ui-kit-system'
import {RotateCw} from 'lucide-solid'
import type {LiveSession} from '@conciv/contract'
import {CandidateList} from './candidate-list.js'
import {LeaveConfirm} from './leave-confirm.js'
import {ReloadCard} from './reload-card.js'
import {SnippetCard} from './snippet-card.js'
import {dialogIsOpen, type ConnectStep} from './connect-steps.js'
import {
  CANCEL_LABEL,
  CHECKED_PREFIX,
  CHECKING_LABEL,
  DIALOG_TITLE,
  REFRESH_LABEL,
  checkedLabel,
} from './connect-copy.js'

const FRESHNESS = 'flex items-center gap-1.5 text-pw-text-3 text-xs'
const REFRESH = 'size-11'
const TOUCH = 'min-h-11 px-3'

function pickingOf(step: ConnectStep): {error: string | null; retryId: string | null} | undefined {
  return step.kind === 'picking' ? step : undefined
}

function reloadOf(step: ConnectStep) {
  return step.kind === 'reload' ? step : undefined
}

function leaveConfirmOf(step: ConnectStep) {
  return step.kind === 'leaveConfirm' ? step : undefined
}

function snippetOf(step: ConnectStep) {
  return step.kind === 'snippet' ? step : undefined
}

export function ConnectDialog(props: {
  step: ConnectStep
  harnessName: string
  candidates: LiveSession[] | undefined
  loading: boolean
  refreshing: boolean
  failure: string | null
  stale: boolean
  checkedAt: number
  connectingId: string | null
  dialledIn: boolean
  contactLost: boolean
  unreachable: boolean
  onPick: (session: LiveSession) => void
  onRetry: () => void
  onRefresh: () => void
  onLaunch: () => void
  onBack: () => void
  onDone: () => void
  onKeepWaiting: () => void
  onHandBack: () => void
  onClose: () => void
}): JSX.Element {
  const [local] = splitProps(props, [
    'step',
    'harnessName',
    'candidates',
    'loading',
    'refreshing',
    'failure',
    'stale',
    'checkedAt',
    'connectingId',
    'dialledIn',
    'contactLost',
    'unreachable',
    'onPick',
    'onRetry',
    'onRefresh',
    'onLaunch',
    'onBack',
    'onDone',
    'onKeepWaiting',
    'onHandBack',
    'onClose',
  ])
  const checked = () => checkedLabel(local.checkedAt)
  const [target, setTarget] = createSignal<HTMLElement | null>(null)
  let focusedKind = ''
  let alreadyOpen = false
  createEffect(() => {
    const kind = local.step.kind
    if (kind === 'closed') {
      focusedKind = ''
      alreadyOpen = false
      setTarget(null)
      return
    }
    const element = target()
    if (!element) {
      alreadyOpen = true
      return
    }
    if (kind === focusedKind) return
    const handedOverAtOpen = !alreadyOpen
    focusedKind = kind
    alreadyOpen = true
    if (!handedOverAtOpen) element.focus()
  })
  return (
    <Dialog
      open={dialogIsOpen(local.step)}
      onOpenChange={() => local.onClose()}
      dismissable
      size="lg"
      title={DIALOG_TITLE}
      initialFocus={() => target()}
      footer={
        <div class="flex justify-between items-center gap-2">
          <Show when={checked()}>
            {(at) => (
              <span class={FRESHNESS}>
                <Show when={local.refreshing} fallback={<span>{CHECKED_PREFIX}</span>}>
                  <span>{CHECKING_LABEL}</span>
                </Show>
                <Show when={!local.refreshing}>
                  <RelativeTime value={at()} />
                </Show>
                <TooltipIconButton
                  tooltip={REFRESH_LABEL}
                  class={REFRESH}
                  aria-busy={local.refreshing}
                  disabled={local.refreshing}
                  onClick={() => local.onRefresh()}
                >
                  <RotateCw class="size-3.5 block" />
                </TooltipIconButton>
              </span>
            )}
          </Show>
          <Button variant="ghost" size="sm" class={`ms-auto ${TOUCH}`} onClick={() => local.onClose()}>
            {CANCEL_LABEL}
          </Button>
        </div>
      }
    >
      <Switch>
        <Match when={pickingOf(local.step)}>
          {(picking) => (
            <CandidateList
              sessions={local.candidates}
              harnessName={local.harnessName}
              loading={local.loading}
              failure={local.failure}
              stale={local.stale}
              checkedAt={local.checkedAt}
              error={picking().error}
              connectingId={local.connectingId}
              focusRef={setTarget}
              onPick={local.onPick}
              onRetry={local.onRetry}
              onRefresh={local.onRefresh}
              onLaunch={local.onLaunch}
            />
          )}
        </Match>
        <Match when={reloadOf(local.step)}>
          {(reload) => (
            <ReloadCard
              adopted={reload().adopted}
              dialledIn={local.dialledIn}
              contactLost={local.contactLost}
              unreachable={local.unreachable}
              focusRef={setTarget}
              onBack={local.onBack}
              onDone={local.onDone}
            />
          )}
        </Match>
        <Match when={leaveConfirmOf(local.step)}>
          {(leaving) => (
            <LeaveConfirm
              title={leaving().adopted.title}
              focusRef={setTarget}
              onKeepWaiting={local.onKeepWaiting}
              onHandBack={local.onHandBack}
            />
          )}
        </Match>
        <Match when={snippetOf(local.step)}>
          {(snippet) => (
            <SnippetCard
              command={snippet().command}
              detail={snippet().detail}
              focusRef={setTarget}
              onClose={local.onClose}
            />
          )}
        </Match>
      </Switch>
    </Dialog>
  )
}
