import {type JSX} from 'solid-js'
import type {Context} from '@conciv/plugin/experimental'

type DragPromptProps = {
  ui: Context['ui']
  anchor: () => HTMLElement | undefined
  open: boolean
  onDisconnect: () => void
  onKeep: () => void
  onCancel: () => void
}

export function DragPrompt(props: DragPromptProps): JSX.Element {
  return (
    <props.ui.Popover
      anchor={props.anchor}
      open={props.open}
      onOpenChange={(open) => open || props.onCancel()}
      label="Pin drift"
    >
      <div class="p-1 flex flex-col min-w-45 pointer-events-auto">
        <props.ui.Button variant="ghost" size="small" class="justify-start" onClick={() => props.onDisconnect()}>
          Disconnect from source
        </props.ui.Button>
        <props.ui.Button variant="ghost" size="small" class="justify-start" onClick={() => props.onKeep()}>
          Keep link, accept drift
        </props.ui.Button>
        <props.ui.Button variant="ghost" size="small" class="justify-start" onClick={() => props.onCancel()}>
          Cancel
        </props.ui.Button>
      </div>
    </props.ui.Popover>
  )
}
