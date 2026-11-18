import {type JSX} from 'solid-js'
import {usePlugin} from '@conciv/plugin/experimental'

type DragPromptProps = {
  anchor: () => HTMLElement | undefined
  open: boolean
  onDisconnect: () => void
  onKeep: () => void
  onCancel: () => void
}

export function DragPrompt(props: DragPromptProps): JSX.Element {
  const ui = usePlugin().ui
  return (
    <ui.Popover
      anchor={props.anchor}
      open={props.open}
      onOpenChange={(open) => open || props.onCancel()}
      label="Pin drift"
    >
      <div class="flex flex-col min-w-45 pointer-events-auto">
        <ui.Button variant="ghost" size="small" class="justify-start" onClick={() => props.onDisconnect()}>
          Disconnect from source
        </ui.Button>
        <ui.Button variant="ghost" size="small" class="justify-start" onClick={() => props.onKeep()}>
          Keep link, accept drift
        </ui.Button>
        <ui.Button variant="ghost" size="small" class="justify-start" onClick={() => props.onCancel()}>
          Cancel
        </ui.Button>
      </div>
    </ui.Popover>
  )
}
