import {Show, type JSX} from 'solid-js'
import {usePlugin} from '@conciv/plugin/experimental'

type DragPromptProps = {
  source: string | undefined
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
        <Show when={props.source}>
          {(source) => <h2 class="text-chat-xs text-chat-text-2 font-chat-mono px-2 pb-1">{source()}</h2>}
        </Show>
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
