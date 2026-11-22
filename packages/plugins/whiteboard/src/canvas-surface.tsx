import {onCleanup, onMount, Show, untrack, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {makeEventListener} from '@solid-primitives/event-listener'
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline'
import {usePlugin, type Context} from '@conciv/plugin/experimental'
import {Effect, Exit, Scope} from 'effect'
import {Island} from './island.js'
import {makeLiveCursors, type LiveCursors} from './live-cursors.js'
import {WhiteboardDbProvider} from './db.js'
import {CommentsProvider, useComments} from './comments.js'
import {PinsLayer} from './pins.js'
import {Inbox, InboxToggle} from './inbox.js'
import type {ChatCover} from './comments-model.js'
import {ThreadPopover} from './thread.js'
import type {CanvasBackground} from './stores.js'

const CANVAS_STYLES = excalidrawCss
  .replaceAll(/:root\[dir=(ltr|rtl)\]/g, ':host(:dir($1))')
  .replaceAll(/:root(?=\s*\{)/g, ':host')

const EXCALIDRAW_INSIDE_MARKER = 'data-prevent-outside-click'

const OPEN_CHAT_LAYER =
  '[data-scope]:not([data-scope="tabs"], [data-scope="dialog"], [data-scope="collapsible"])[data-part="content"][data-state="open"]'

const layerOpenBeside = (node: unknown): boolean => {
  if (!(node instanceof Node)) return false
  const root = node.getRootNode()
  return (root instanceof ShadowRoot || root instanceof Document) && root.querySelector(OPEN_CHAT_LAYER) !== null
}

const escapeLeftToOthers = (event: KeyboardEvent, layers: readonly HTMLElement[], dialogOpen: boolean): boolean => {
  const path = event.composedPath()
  return (
    event.key !== 'Escape' || dialogOpen || layers.some((layer) => path.includes(layer)) || layerOpenBeside(path[0])
  )
}

type SurfaceProps = {
  client: Context['client']
  room: string
  catchUpRetryMs: number
  background: CanvasBackground
  visible: boolean
  layer: HTMLElement
  close: () => void
  bindComments: (comments: ChatCover | undefined) => void
}

function CanvasView(
  props: Pick<SurfaceProps, 'room' | 'background' | 'visible' | 'layer'> & {canvas: HTMLElement; cursors: LiveCursors},
): JSX.Element {
  const model = useComments()
  const ctx = usePlugin()
  return (
    <>
      <Island
        mount={props.canvas}
        room={props.room}
        theme={ctx.appearance.mode()}
        background={props.background}
        visible={props.visible}
        onViewport={model.setViewport}
        registerPan={model.registerPan}
        cursors={props.cursors}
      />
      <Portal mount={props.layer}>
        <Show when={props.visible}>
          <InboxToggle />
          <PinsLayer />
          <Inbox />
        </Show>
        <ThreadPopover visible={props.visible} />
      </Portal>
    </>
  )
}

export default function CanvasSurface(props: SurfaceProps): JSX.Element {
  const ctx = usePlugin()
  const canvas = ctx.overlay({styles: [CANVAS_STYLES]})
  const scope = Effect.runSync(Scope.make())
  onCleanup(() => void Effect.runFork(Scope.close(scope, Exit.void)))
  const cursors = untrack(() => Effect.runSync(makeLiveCursors(props.client, props.room).pipe(Scope.provide(scope))))
  const overlayRoot = canvas.element.getRootNode()
  if (overlayRoot instanceof ShadowRoot) overlayRoot.host.setAttribute(EXCALIDRAW_INSIDE_MARKER, '')
  onMount(() =>
    makeEventListener(
      window,
      'keydown',
      (event) => {
        if (!props.visible || escapeLeftToOthers(event, [canvas.element, props.layer], ctx.dialogs.active())) return
        event.preventDefault()
        event.stopPropagation()
        props.close()
      },
      true,
    ),
  )
  return (
    <WhiteboardDbProvider client={props.client} room={props.room} catchUpRetryMs={props.catchUpRetryMs}>
      <CommentsProvider room={() => props.room} bindComments={props.bindComments}>
        <CanvasView
          room={props.room}
          background={props.background}
          visible={props.visible}
          layer={props.layer}
          canvas={canvas.element}
          cursors={cursors}
        />
      </CommentsProvider>
    </WhiteboardDbProvider>
  )
}
