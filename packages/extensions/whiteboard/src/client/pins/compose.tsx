import {createSignal, type JSX} from 'solid-js'
import {Button, TextField} from '@mandarax/ui-kit-system'
import type {CommentPick} from '../overlay.js'

export type ComposeProps = {
  pick: CommentPick
  onSubmit: (text: string) => void
  onCancel: () => void
}

const PANEL =
  'absolute pointer-events-auto w-72 max-w-[calc(100vw-2rem)] flex flex-col gap-2 p-3 rounded-pw-lg bg-pw-panel text-pw-text border border-pw-line shadow-pw-lg'

const anchorOf = (pick: CommentPick): {x: number; y: number} =>
  pick.rect ? {x: pick.rect.x + pick.rect.width / 2, y: pick.rect.y + pick.rect.height / 2} : {x: 80, y: 80}

export function Compose(props: ComposeProps): JSX.Element {
  const [draft, setDraft] = createSignal('')
  const anchor = anchorOf(props.pick)
  const submit = (): void => {
    const text = draft().trim()
    if (!text) return props.onCancel()
    props.onSubmit(text)
  }
  return (
    <div role="dialog" aria-label="New comment" class={PANEL} style={{left: `${anchor.x}px`, top: `${anchor.y}px`}}>
      <TextField
        aria-label="Comment"
        ref={(element) => queueMicrotask(() => element.focus())}
        placeholder="Add a comment"
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.isComposing) submit()
          if (event.key === 'Escape') props.onCancel()
        }}
      />
      <div class="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" aria-label="Cancel comment" onClick={() => props.onCancel()}>
          Cancel
        </Button>
        <Button size="sm" aria-label="Add comment" onClick={() => submit()}>
          Add
        </Button>
      </div>
    </div>
  )
}
