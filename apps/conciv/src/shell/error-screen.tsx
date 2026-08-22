import type {JSX} from 'solid-js'
import AlertTriangle from 'lucide-solid/icons/alert-triangle'
import {Button} from '@conciv/ui-kit-system'

export type ErrorScreenProps = {
  message: string
  onRetry: () => void
}

export function ErrorScreen(props: ErrorScreenProps): JSX.Element {
  return (
    <div
      class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-chat-text"
      role="alert"
      data-conciv-error-screen
    >
      <AlertTriangle class="size-8 text-chat-danger" aria-hidden="true" />
      <p class="text-[0.875rem] leading-[1.45] text-chat-text-2 max-w-72">{props.message}</p>
      <Button variant="outline-danger" onClick={props.onRetry}>
        Retry
      </Button>
    </div>
  )
}
