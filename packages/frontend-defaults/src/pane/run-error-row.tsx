import {Show, createUniqueId, type JSX} from 'solid-js'
import {CONTEXT_OVERFLOW_CODE, SESSION_DELETED_CODE} from '@conciv/types/chat-event-types'
import {Button} from '@conciv/ui-kit-system'
import {rpcErrorCode} from '../shell/rpc-error-message.js'

const ERROR = 'flex gap-2 items-center text-chat-danger text-[0.75rem] anim-msg'
const ACTION =
  'py-1.5 px-2.5 min-h-8 rounded-chat-surface-sm [border-color:var(--chat-danger-line)] text-chat-danger font-semibold text-[0.75rem] leading-none shrink-0 hover:bg-chat-danger-14'
const CONTEXT_OVERFLOW_MESSAGE = 'This conversation is too long for the model. Compact it to keep going.'
export const SESSION_DELETED_MESSAGE = 'This session was deleted, so your message was not sent.'

type RunErrorRowProps = {
  error: Error
  compacting: boolean
  onRetry?: () => void
  onCompact: () => void
}

export function sessionDeleted(error: unknown): boolean {
  return rpcErrorCode(error) === SESSION_DELETED_CODE
}

function rowMessage(error: Error): string {
  if (rpcErrorCode(error) === CONTEXT_OVERFLOW_CODE) return CONTEXT_OVERFLOW_MESSAGE
  if (sessionDeleted(error)) return SESSION_DELETED_MESSAGE
  return error.message
}

export function RunErrorRow(props: RunErrorRowProps): JSX.Element {
  const overflowed = () => rpcErrorCode(props.error) === CONTEXT_OVERFLOW_CODE
  const retry = () => (sessionDeleted(props.error) ? undefined : props.onRetry)
  const messageId = createUniqueId()
  return (
    <div class={ERROR} role="alert" aria-labelledby={messageId}>
      <span id={messageId} class="flex-1">
        {rowMessage(props.error)}
      </span>
      <Show
        when={overflowed()}
        fallback={
          <Show when={retry()}>
            {(onRetry) => (
              <Button variant="plain" size="none" class={ACTION} onClick={() => onRetry()()}>
                Retry
              </Button>
            )}
          </Show>
        }
      >
        <Button
          variant="plain"
          size="none"
          class={ACTION}
          aria-label="Compact conversation"
          disabled={props.compacting}
          onClick={() => props.onCompact()}
        >
          Compact
        </Button>
      </Show>
    </div>
  )
}
