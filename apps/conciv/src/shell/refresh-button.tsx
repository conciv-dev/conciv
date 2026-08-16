import type {JSX} from 'solid-js'
import RefreshCw from 'lucide-solid/icons/refresh-cw'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {chatBusy} from '@conciv/ui-kit-chat'
import {usePane} from '../app/pane-context.js'

export function RefreshButton(props: {class?: string}): JSX.Element {
  const pane = usePane()
  return (
    <TooltipIconButton
      tooltip="Refresh the conversation"
      class={props.class}
      disabled={chatBusy(pane.chat())}
      onClick={() => pane.chat().refresh()}
    >
      <RefreshCw class="size-[1em] block" aria-hidden="true" />
    </TooltipIconButton>
  )
}
