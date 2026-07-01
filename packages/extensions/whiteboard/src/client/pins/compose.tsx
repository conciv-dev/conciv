import {createSignal, type JSX} from 'solid-js'
import {Button, TextField} from '@mandarax/ui-kit-system'
import {useComments, type ComposeTarget} from '../model/comments.js'

const PANEL =
  'absolute pointer-events-auto w-72 max-w-[calc(100vw-2rem)] flex flex-col gap-2 p-3 rounded-pw-lg bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg'

export function Compose(props: {target: ComposeTarget}): JSX.Element {
  const model = useComments()
  const [draft, setDraft] = createSignal('')
  const submit = (): void => {
    const text = draft().trim()
    if (!text) return model.cancelCompose()
    model.createComment(props.target, text)
  }
  return (
    <div
      role="dialog"
      aria-label="New comment"
      class={PANEL}
      style={{left: `${props.target.screen.x}px`, top: `${props.target.screen.y}px`}}
    >
      <TextField
        aria-label="Comment"
        ref={(element) => queueMicrotask(() => element.focus())}
        placeholder="Add a comment"
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.isComposing) submit()
          if (event.key === 'Escape') model.cancelCompose()
        }}
      />
      <div class="flex gap-2 justify-end">
        <Button variant="ghost" size="md" aria-label="Cancel comment" onClick={() => model.cancelCompose()}>
          Cancel
        </Button>
        <Button size="md" aria-label="Add comment" onClick={() => submit()}>
          Add
        </Button>
      </div>
    </div>
  )
}
