import {onMount, Show, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {makeEventListener} from '@solid-primitives/event-listener'
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline'
import {usePlugin, type Context} from '@conciv/plugin/experimental'
import {Island} from '../canvas/island.js'
import {WhiteboardDbProvider} from './db.js'
import {CommentsProvider, useComments} from './model/comments.js'
import {PinsLayer} from './pins/pins.js'
import type {ChatCover} from './model/comments-model.js'
import {ThreadPopover} from './pins/thread.js'

const CANVAS_STYLES = excalidrawCss.replaceAll(/:root(?=\s*\{)/g, ':host')

const EXCALIDRAW_INSIDE_MARKER = 'data-prevent-outside-click'

const OPEN_CHAT_LAYER =
  '[data-scope]:not([data-scope="tabs"], [data-scope="dialog"])[data-part="content"][data-state="open"]'

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
  visible: boolean
  layer: HTMLElement
  close: () => void
  bindComments: (comments: ChatCover | undefined) => void
}

function CanvasView(props: Pick<SurfaceProps, 'room' | 'visible' | 'layer'> & {canvas: HTMLElement}): JSX.Element {
  const model = useComments()
  const ctx = usePlugin()
  return (
    <>
      <Island
        mount={props.canvas}
        room={props.room}
        theme={ctx.appearance.mode()}
        visible={props.visible}
        onViewport={model.setViewport}
      />
      <Portal mount={props.layer}>
        <Show when={props.visible}>
          <PinsLayer />
        </Show>
        <ThreadPopover visible={props.visible} />
      </Portal>
    </>
  )
}

export default function CanvasSurface(props: SurfaceProps): JSX.Element {
  const ctx = usePlugin()
  const canvas = ctx.overlay({styles: [CANVAS_STYLES]})
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
        <CanvasView room={props.room} visible={props.visible} layer={props.layer} canvas={canvas.element} />
      </CommentsProvider>
    </WhiteboardDbProvider>
  )
}
