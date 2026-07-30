import {Show, splitProps, type JSX} from 'solid-js'
import {Button, Dialog} from '@conciv/ui-kit-system'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function errorMessageFor(error: unknown, code: string): string | null {
  const seen = new Set<unknown>()
  let candidate: unknown = error
  while (isRecord(candidate) && !seen.has(candidate)) {
    seen.add(candidate)
    if (candidate.code === code) {
      const message = candidate.message
      return typeof message === 'string' && message.length > 0 ? message : ''
    }
    candidate = candidate.cause
  }
  return null
}

export function externalActiveMessage(error: unknown): string | null {
  const message = errorMessageFor(error, 'EXTERNAL_ACTIVE')
  if (message === null) return null
  return message.length > 0 ? message : 'Claude is open in your terminal.'
}

export function sessionAttachedMessage(error: unknown): string | null {
  const message = errorMessageFor(error, 'SESSION_ATTACHED')
  if (message === null) return null
  return message.length > 0 ? message : 'This session is driven from your terminal.'
}

export function ExternalSessionConfirm(props: {
  message: string | null
  question?: string
  confirmLabel?: string
  onCancel: () => void
  onSendAnyway: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['message', 'question', 'confirmLabel', 'onCancel', 'onSendAnyway'])
  return (
    <Dialog open={local.message !== null} onOpenChange={() => local.onCancel()} label="Terminal session is active">
      <Show when={local.message}>
        {(message) => (
          <div class="flex flex-col gap-3">
            <p class="text-pw-text text-sm leading-normal">{message()}</p>
            <p class="text-pw-text-3 text-xs leading-normal">{local.question ?? 'Send it here anyway?'}</p>
            <div class="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => local.onCancel()}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => local.onSendAnyway()}>
                {local.confirmLabel ?? 'Send anyway'}
              </Button>
            </div>
          </div>
        )}
      </Show>
    </Dialog>
  )
}
