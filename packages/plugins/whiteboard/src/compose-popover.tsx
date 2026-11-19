import type {JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import type {Context} from '@conciv/plugin/experimental'
import type {ElementRect} from '@conciv/plugin/experimental/grab'

export function ComposePopover(props: {
  ui: Context['ui']
  anchor: ElementRect
  answer: (text: string) => void
}): JSX.Element {
  const [state, setState] = createStore<{text: string; anchor: HTMLElement | undefined}>({
    text: '',
    anchor: undefined,
  })
  const cancel = (): void => props.answer('')
  const submit = (): void => props.answer(state.text)
  return (
    <>
      <div
        ref={(element) => setState('anchor', element)}
        class="pointer-events-none fixed"
        style={{
          left: `${props.anchor.x}px`,
          top: `${props.anchor.y}px`,
          width: `${props.anchor.width}px`,
          height: `${props.anchor.height}px`,
        }}
      />
      <props.ui.Popover
        anchor={() => state.anchor}
        open={state.anchor !== undefined}
        onOpenChange={(open) => open || cancel()}
        label="New comment"
      >
        <div class="flex flex-col gap-2 w-72 pointer-events-auto">
          <props.ui.TextInput
            label="Comment"
            placeholder="Add a comment"
            autofocus
            value={state.text}
            onInput={(text) => setState('text', text)}
            onSubmit={submit}
          />
          <div class="flex gap-2 justify-end">
            <props.ui.Button variant="ghost" onClick={cancel}>
              Cancel
            </props.ui.Button>
            <props.ui.Button variant="contrast" onClick={submit}>
              Add comment
            </props.ui.Button>
          </div>
        </div>
      </props.ui.Popover>
    </>
  )
}
