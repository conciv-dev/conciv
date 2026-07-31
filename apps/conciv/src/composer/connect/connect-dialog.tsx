import {Match, Show, Switch, splitProps, type JSX} from 'solid-js'
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
const REFRESH = 'size-6'

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
  onPick: (session: LiveSession) => void
  onRetry: () => void
  onRefresh: () => void
  onLaunch: () => void
  onCopy: (text: string) => void
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
    'onPick',
    'onRetry',
    'onRefresh',
    'onLaunch',
    'onCopy',
    'onBack',
    'onDone',
    'onKeepWaiting',
    'onHandBack',
    'onClose',
  ])
  const checked = () => checkedLabel(local.checkedAt)
  return (
    <Dialog
      open={dialogIsOpen(local.step)}
      onOpenChange={() => local.onClose()}
      dismissable
      size="lg"
      title={DIALOG_TITLE}
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
                  onClick={() => local.onRefresh()}
                >
                  <RotateCw class="size-3.5 block" />
                </TooltipIconButton>
              </span>
            )}
          </Show>
          <Button variant="ghost" size="sm" class="ms-auto" onClick={() => local.onClose()}>
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
              onCopy={local.onCopy}
              onBack={local.onBack}
              onDone={local.onDone}
            />
          )}
        </Match>
        <Match when={leaveConfirmOf(local.step)}>
          {(leaving) => (
            <LeaveConfirm
              title={leaving().adopted.title}
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
              onCopy={local.onCopy}
              onClose={local.onClose}
            />
          )}
        </Match>
      </Switch>
    </Dialog>
  )
}
