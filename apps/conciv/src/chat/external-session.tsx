import {Show, splitProps, type JSX} from 'solid-js'
import {Button, Dialog} from '@conciv/ui-kit-system'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function externalActiveMessage(error: unknown): string | null {
  const seen = new Set<unknown>()
  let candidate: unknown = error
  while (isRecord(candidate) && !seen.has(candidate)) {
    seen.add(candidate)
    if (candidate.code === 'EXTERNAL_ACTIVE') {
      const message = candidate.message
      return typeof message === 'string' && message.length > 0 ? message : 'Claude is open in your terminal.'
    }
    candidate = candidate.cause
  }
  return null
}

export function ExternalSessionConfirm(props: {
  message: string | null
  onCancel: () => void
  onSendAnyway: () => void
}): JSX.Element {
  const [local] = splitProps(props, ['message', 'onCancel', 'onSendAnyway'])
  return (
    <Dialog open={local.message !== null} onOpenChange={() => local.onCancel()} label="Terminal session is active">
      <Show when={local.message}>
        {(message) => (
          <div class="flex flex-col gap-3">
            <p class="text-pw-text text-sm leading-normal">{message()}</p>
            <p class="text-pw-text-3 text-xs leading-normal">Send it here anyway?</p>
            <div class="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => local.onCancel()}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => local.onSendAnyway()}>
                Send anyway
              </Button>
            </div>
          </div>
        )}
      </Show>
    </Dialog>
  )
}
