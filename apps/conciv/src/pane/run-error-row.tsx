import {Show, type JSX} from 'solid-js'
import {CONTEXT_OVERFLOW_CODE} from '@conciv/protocol/chat-event-types'
import {Button} from '@conciv/ui-kit-system'

const ERROR = 'flex gap-2 items-center text-chat-danger text-[0.75rem] anim-msg'
const ACTION =
  'py-1.5 px-2.5 min-h-8 rounded-chat-surface-sm [border-color:var(--chat-danger-line)] text-chat-danger font-semibold text-[0.75rem] leading-none shrink-0 hover:bg-chat-danger-14'
const CONTEXT_OVERFLOW_MESSAGE = 'This conversation is too long for the model. Compact it to keep going.'

type RunErrorRowProps = {
  error: Error
  onRetry: () => void
  onCompact: () => void
}

export function RunErrorRow(props: RunErrorRowProps): JSX.Element {
  const overflowed = () => errorCode(props.error) === CONTEXT_OVERFLOW_CODE
  return (
    <div class={ERROR} role="alert">
      <span class="flex-1">{overflowed() ? CONTEXT_OVERFLOW_MESSAGE : props.error.message}</span>
      <Show
        when={overflowed()}
        fallback={
          <Button variant="plain" size="none" class={ACTION} onClick={() => props.onRetry()}>
            Retry
          </Button>
        }
      >
        <Button
          variant="plain"
          size="none"
          class={ACTION}
          aria-label="Compact conversation"
          onClick={() => props.onCompact()}
        >
          Compact
        </Button>
      </Show>
    </div>
  )
}

function errorCode(error: Error): unknown {
  return 'code' in error ? error.code : undefined
}
