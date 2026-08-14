import {Show, onMount, type Accessor, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline'
import {getExtensionApi} from '@conciv/extension'
import {WHITEBOARD_NAME} from '../shared/meta.js'
import {Island} from '../canvas/island.js'
import {CommentsProvider, useComments, type ComposeTarget} from './model/comments.js'
import {Inbox, InboxToggle} from './inbox.js'
import {PinsLayer} from './pins/pins.js'
import {ThreadPopover} from './pins/thread.js'
import {Compose} from './pins/compose.js'
import type {CommentPick, Self, SurfaceState} from './surface-types.js'

const toComposeTarget = (pick: CommentPick): ComposeTarget => ({
  source: pick.source ? {file: pick.source.filePath, line: pick.source.lineNumber ?? null} : null,
  screen: pick.rect ? {x: pick.rect.x + pick.rect.width / 2, y: pick.rect.y + pick.rect.height / 2} : {x: 80, y: 80},
})

function injectExcalidrawCss(doc: Document): void {
  if (doc.head.querySelector('[data-whiteboard-style]')) return
  const style = doc.createElement('style')
  style.setAttribute('data-whiteboard-style', '')
  style.textContent = excalidrawCss
  doc.head.appendChild(style)
}

function ComposeRegistration(props: {registerComment: (write: (pick: CommentPick) => void) => void}): JSX.Element {
  const model = useComments()
  onMount(() => props.registerComment((pick) => model.startCompose(toComposeTarget(pick))))
  return <></>
}

function CanvasView(props: {
  doc: Document
  visible: Accessor<boolean>
  room: Accessor<string>
  self: Self
  close: () => void
}): JSX.Element {
  const model = useComments()

  const overlayBusy = (): boolean => model.openCid() !== null || model.composeTarget() !== null || model.inboxOpen()
  const insideExcalidraw = (event: KeyboardEvent): boolean => {
    const target = event.target
    return target instanceof Element && target.closest('.excalidraw') !== null
  }
  const escapeClosesCanvas = (event: KeyboardEvent): boolean =>
    event.key === 'Escape' && props.visible() && !overlayBusy() && !insideExcalidraw(event)

  onMount(() => {
    const win = props.doc.defaultView
    if (!win) return
    const onKey = (event: KeyboardEvent): void => {
      if (escapeClosesCanvas(event)) props.close()
    }
    makeEventListener(win, 'keydown', onKey, true)
  })
  return (
    <>
      <Island
        doc={props.doc}
        room={props.room()}
        theme="dark"
        self={props.self}
        visible={props.visible()}
        onViewport={model.setViewport}
        registerPan={model.registerPan}
      />
      <Show when={props.visible()}>
        <PinsLayer />
        <ThreadPopover />
        <InboxToggle />
        <Inbox />
      </Show>
      <Show when={model.composeTarget()}>{(target) => <Compose target={target()} />}</Show>
    </>
  )
}

export default function CanvasSurface(props: {state: SurfaceState; room: Accessor<string>; self: Self}): JSX.Element {
  const host = getExtensionApi(WHITEBOARD_NAME)
  const apiBase = host.useApiBase()
  const toast = host.useToast()
  const onComposeSettled = (outcome: 'added' | 'cancelled'): void => {
    props.state.settleCompose()
    if (outcome === 'added' && !props.state.open()) toast('Comment added to the whiteboard', 'success')
  }
  onMount(() => injectExcalidrawCss(document))
  return (
    <CommentsProvider
      room={props.room}
      apiBase={apiBase()}
      canvasOpen={props.state.open}
      onComposeSettled={onComposeSettled}
    >
      <ComposeRegistration registerComment={props.state.registerComment} />
      <CanvasView
        doc={document}
        visible={props.state.visible}
        room={props.room}
        self={props.self}
        close={props.state.close}
      />
    </CommentsProvider>
  )
}
