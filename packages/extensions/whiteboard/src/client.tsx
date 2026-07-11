import {Show, createRoot, createSignal, type JSX} from 'solid-js'
import {MessageSquarePlus, Presentation} from 'lucide-solid'
import {defineExtension, getHostApi} from '@conciv/extension'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'
import {WhiteboardSurface, type CommentPick, type SurfaceState} from './client/overlay.js'

type PickPhase = 'idle' | 'picking' | 'composing'

function Component(): JSX.Element {
  const host = getHostApi()
  const grab = host.useGrab()
  const slot = host.useSlot()
  const toggle = whiteboard.useContext((context) => context.toggle)
  const comment = whiteboard.useContext((context) => context.comment)
  const pickStarted = whiteboard.useContext((context) => context.pickStarted)
  const pickAborted = whiteboard.useContext((context) => context.pickAborted)
  const pickComment = async (): Promise<void> => {
    pickStarted()
    const grabbed = await grab.comment().catch(() => null)
    if (!grabbed) return pickAborted()
    comment({source: grabbed.source, rect: grabbed.rect})
  }
  return (
    <Show when={slot === 'composer'}>
      <TooltipIconButton tooltip="Open the whiteboard canvas" class="size-9.5" onClick={() => toggle()}>
        <Presentation />
      </TooltipIconButton>
      <TooltipIconButton tooltip="Comment on an element" class="size-9.5" onClick={() => void pickComment()}>
        <MessageSquarePlus />
      </TooltipIconButton>
    </Show>
  )
}

function Surface(): JSX.Element {
  const state = whiteboard.useContext((context): SurfaceState => context)
  return <WhiteboardSurface state={state} />
}

const whiteboard = defineExtension({
  name: WHITEBOARD_NAME,
  tools: [],
  systemPrompt: WHITEBOARD_PROMPT,
  Component,
  Surface,
}).client(() =>
  createRoot((dispose) => {
    const [open, setOpen] = createSignal(false)
    const [engaged, setEngaged] = createSignal(false)
    const [pickPhase, setPickPhase] = createSignal<PickPhase>('idle')
    const visible = (): boolean => open() && pickPhase() === 'idle'
    const pendingComments: CommentPick[] = []
    const writers: ((pick: CommentPick) => void)[] = []
    const registerComment = (write: (pick: CommentPick) => void): void => {
      writers.splice(0, writers.length, write)
      pendingComments.splice(0).forEach(write)
    }
    const close = (): void => void setOpen(false)
    const toggle = (): void => {
      setEngaged(true)
      setPickPhase('idle')
      setOpen((value) => !value)
    }
    const pickStarted = (): void => {
      setEngaged(true)
      setPickPhase('picking')
    }
    const pickAborted = (): void => void setPickPhase('idle')
    const comment = (pick: CommentPick): void => {
      setPickPhase('composing')
      const write = writers[0]
      if (write) return write(pick)
      pendingComments.push(pick)
    }
    const settleCompose = (): void => void setPickPhase('idle')
    return {
      value: {toggle, open, engaged, visible, close, comment, pickStarted, pickAborted, settleCompose, registerComment},
      dispose,
    }
  }),
)

export default whiteboard
