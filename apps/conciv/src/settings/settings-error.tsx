import {Show, splitProps, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'

export function SettingsError(props: {message: string; retryLabel: string; onRetry?: () => void}): JSX.Element {
  const [local] = splitProps(props, ['message', 'retryLabel', 'onRetry'])
  return (
    <div class="chat-settings-error" role="alert">
      <TriangleAlert class="size-4 block shrink-0" aria-hidden="true" />
      <span class="chat-settings-error-text">{local.message}</span>
      <Show when={local.onRetry}>
        {(onRetry) => (
          <Button variant="outline" size="md" class="chat-settings-error-retry" onClick={() => onRetry()()}>
            {local.retryLabel}
          </Button>
        )}
      </Show>
    </div>
  )
}
