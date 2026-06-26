import type {JSX} from 'solid-js'
import {Button} from '@mandarax/ui-kit-system'

export type DragPromptProps = {
  x: number
  y: number
  onDisconnect: () => void
  onKeep: () => void
  onCancel: () => void
}

const PANEL =
  'absolute pointer-events-auto min-w-45 flex flex-col gap-0.5 p-1 rounded-pw-lg bg-pw-panel border border-pw-line shadow-pw-lg'

export function DragPrompt(props: DragPromptProps): JSX.Element {
  return (
    <div role="dialog" aria-label="Pin drift" class={PANEL} style={{left: `${props.x + 16}px`, top: `${props.y}px`}}>
      <Button variant="ghost" size="sm" class="justify-start" onClick={() => props.onDisconnect()}>
        Disconnect from source
      </Button>
      <Button variant="ghost" size="sm" class="justify-start" onClick={() => props.onKeep()}>
        Keep link, accept drift
      </Button>
      <Button variant="ghost" size="sm" class="justify-start" onClick={() => props.onCancel()}>
        Cancel
      </Button>
    </div>
  )
}
