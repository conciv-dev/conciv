import type {JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'

const ERROR = 'flex gap-2 items-center text-chat-danger text-chat-sm anim-msg'

export function PaneAlert(props: {message: string; busy: boolean; onRetry: () => void}): JSX.Element {
  return (
    <div class={ERROR} role="alert">
      <span class="flex-1">{props.message}</span>
      <Button
        variant="outline-danger"
        size="sm"
        class="shrink-0 font-semibold"
        disabled={props.busy}
        aria-busy={props.busy}
        onClick={() => props.onRetry()}
      >
        {props.busy ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  )
}
