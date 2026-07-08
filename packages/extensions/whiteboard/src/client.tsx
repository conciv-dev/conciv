import {Show, createRoot, createSignal, onCleanup, type JSX} from 'solid-js'
import {MessageSquarePlus, Presentation} from 'lucide-solid'
import {defineExtension} from '@conciv/extension'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'
import {mountOverlay, type CommentPick} from './client/overlay.js'

function Component(): JSX.Element {
  const slot = whiteboard.useSlot()
  const toggle = whiteboard.useContext((context) => context.toggle)
  const comment = whiteboard.useContext((context) => context.comment)
  const pickStarted = whiteboard.useContext((context) => context.pickStarted)
  const pickAborted = whiteboard.useContext((context) => context.pickAborted)
  const grab = whiteboard.useContext((context) => context.grab)
  const pickComment = async (): Promise<void> => {
    pickStarted()
    const grabbed = await grab.comment().catch(() => null)
    if (!grabbed) return pickAborted()
    comment({source: grabbed.source, rect: grabbed.rect})
  }
  return (
    <Show when={slot() === 'composer'}>
      <TooltipIconButton tooltip="Open the whiteboard canvas" class="size-9.5" onClick={() => toggle()}>
        <Presentation />
      </TooltipIconButton>
      <TooltipIconButton tooltip="Comment on an element" class="size-9.5" onClick={() => void pickComment()}>
        <MessageSquarePlus />
      </TooltipIconButton>
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
    const [pickPhase, setPickPhase] = createSignal<'idle' | 'picking' | 'composing'>('idle')
    const visible = (): boolean => open() && pickPhase() === 'idle'
    let disposeOverlay: (() => void) | undefined
    let commentWriter: ((pick: CommentPick) => void) | undefined
    const pendingComments: CommentPick[] = []
    const registerComment = (write: (pick: CommentPick) => void): void => {
      commentWriter = write
      pendingComments.splice(0).forEach(write)
    }
    const close = (): void => void setOpen(false)
    const onComposeSettled = (outcome: 'added' | 'cancelled'): void => {
      setPickPhase('idle')
      if (outcome === 'added' && !open()) api.toast('Comment added to the whiteboard', 'success')
    }
    const start = (): void => {
      if (!disposeOverlay)
        disposeOverlay = mountOverlay({api, open: visible, canvasOpen: open, close, registerComment, onComposeSettled})
    }
    const toggle = (): void => {
      start()
      setPickPhase('idle')
      setOpen((value) => !value)
    }
    const pickStarted = (): void => {
      start()
      setPickPhase('picking')
    }
    const pickAborted = (): void => void setPickPhase('idle')
    const comment = (pick: CommentPick): void => {
      start()
      setPickPhase('composing')
      if (commentWriter) return commentWriter(pick)
      pendingComments.push(pick)
    }
    onCleanup(() => disposeOverlay?.())
    onCleanup(api.yieldFocusWhile(visible))
    return {value: {toggle, open, comment, pickStarted, pickAborted}, dispose}
  }),
)

export default whiteboard
