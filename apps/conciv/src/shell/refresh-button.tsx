import {Show, type JSX} from 'solid-js'
import RefreshCw from 'lucide-solid/icons/refresh-cw'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {usePane} from '../app/pane-context.js'

export function RefreshButton(props: {class?: string}): JSX.Element {
  const pane = usePane()
  return (
    <Show when={pane.refresh()}>
      {(handle) => (
        <TooltipIconButton
          tooltip="Refresh the conversation"
          class={props.class}
          disabled={handle().busy()}
          onClick={() => handle().run()}
        >
          <RefreshCw class="size-[1em] block" aria-hidden="true" />
        </TooltipIconButton>
      )}
    </Show>
  )
}
