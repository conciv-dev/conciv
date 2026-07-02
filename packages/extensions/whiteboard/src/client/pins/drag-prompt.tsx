import {type JSX} from 'solid-js'
import {Button, Popover} from '@conciv/ui-kit-system'

export type DragPromptProps = {
  x: number
  y: number
  onDisconnect: () => void
  onKeep: () => void
  onCancel: () => void
}

const CONTENT = 'min-w-45 flex flex-col gap-0.5 p-1'

export function DragPrompt(props: DragPromptProps): JSX.Element {
  return (
    <Popover.Root
      open={true}
      onOpenChange={(detail) => detail.open || props.onCancel()}
      positioning={{
        placement: 'right-start',
        gutter: 8,
        getAnchorRect: () => ({x: props.x + 16, y: props.y, width: 0, height: 0}),
      }}
    >
      <Popover.Positioner>
        <Popover.Content class={CONTENT} aria-label="Pin drift">
          <Button
            ref={(element) => queueMicrotask(() => element.focus())}
            variant="ghost"
            size="sm"
            class="justify-start"
            onClick={() => props.onDisconnect()}
          >
            Disconnect from source
          </Button>
          <Button variant="ghost" size="sm" class="justify-start" onClick={() => props.onKeep()}>
            Keep link, accept drift
          </Button>
          <Button variant="ghost" size="sm" class="justify-start" onClick={() => props.onCancel()}>
            Cancel
          </Button>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
