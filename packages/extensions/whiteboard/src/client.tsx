import {Show, createRoot, createSignal, onCleanup, type JSX} from 'solid-js'
import {MessageSquarePlus, Presentation} from 'lucide-solid'
import {defineExtension} from '@mandarax/extension'
import {Button} from '@mandarax/ui-kit-system'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'
import {mountOverlay, type CommentPick} from './client/overlay.js'

function Component(): JSX.Element {
  const slot = whiteboard.useSlot()
  const toggle = whiteboard.useContext((context) => context.toggle)
  const comment = whiteboard.useContext((context) => context.comment)
  const grab = whiteboard.useContext((context) => context.grab)
  const pickComment = async (): Promise<void> => {
    const grabbed = await grab.pick()
    if (grabbed) comment({source: grabbed.source, rect: grabbed.rect})
  }
  return (
    <Show when={slot() === 'composer'}>
      <Button variant="ghost" size="icon" aria-label="Open the whiteboard canvas" onClick={() => toggle()}>
        <Presentation />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Comment on an element" onClick={() => void pickComment()}>
        <MessageSquarePlus />
      </Button>
    </Show>
  )
}

const whiteboard = defineExtension({
  name: WHITEBOARD_NAME,
  tools: [],
  systemPrompt: WHITEBOARD_PROMPT,
  Component,
}).client(() =>
  createRoot((dispose) => {
    const api = whiteboard.useClientApi()
    const [open, setOpen] = createSignal(false)
    let disposeOverlay: (() => void) | undefined
    let commentWriter: ((pick: CommentPick) => void) | undefined
    const pendingComments: CommentPick[] = []
    const registerComment = (write: (pick: CommentPick) => void): void => {
      commentWriter = write
      pendingComments.splice(0).forEach(write)
    }
    const start = (): void => {
      if (!disposeOverlay) disposeOverlay = mountOverlay({api, open, registerComment})
    }
    const toggle = (): void => {
      start()
      setOpen((value) => !value)
    }
    const comment = (pick: CommentPick): void => {
      start()
      setOpen(true)
      if (commentWriter) return commentWriter(pick)
      pendingComments.push(pick)
    }
    onCleanup(() => disposeOverlay?.())
    return {value: {toggle, open, comment}, dispose}
  }),
)

export default whiteboard
