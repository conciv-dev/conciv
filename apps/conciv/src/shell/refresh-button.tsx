import type {JSX} from 'solid-js'
import RefreshCw from 'lucide-solid/icons/refresh-cw'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {chatBusy} from '@conciv/ui-kit-chat'
import {usePane} from '../app/pane-context.js'

export function RefreshButton(props: {class?: string}): JSX.Element {
  const pane = usePane()
  const spinClass = () => (pane.isRefreshing() ? '[transform-origin:center] anim-tool-spin' : '')
  return (
    <TooltipIconButton
      tooltip={pane.isRefreshing() ? 'Refreshing the conversation' : 'Refresh the conversation'}
      class={props.class}
      disabled={chatBusy(pane.chat()) || pane.isRefreshing()}
      aria-busy={pane.isRefreshing()}
      onClick={() => pane.refresh()}
    >
      <RefreshCw class={`size-[1em] block ${spinClass()}`} aria-hidden="true" />
    </TooltipIconButton>
  )
}
