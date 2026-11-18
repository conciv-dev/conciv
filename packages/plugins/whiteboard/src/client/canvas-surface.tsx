import {onMount, Show, type JSX} from 'solid-js'
import {Portal} from 'solid-js/web'
import {makeEventListener} from '@solid-primitives/event-listener'
import excalidrawCss from '@excalidraw/excalidraw/index.css?inline'
import type {Context} from '@conciv/plugin/experimental'
import {Island} from '../canvas/island.js'
import {WhiteboardDbProvider} from './db.js'
import {CommentsProvider, useComments} from './model/comments.js'
import {PinsLayer} from './pins/pins.js'
import type {ChatCover} from './model/comments-model.js'
import {ThreadPopover} from './pins/thread.js'

function injectExcalidrawCss(doc: Document): void {
  if (doc.head.querySelector('[data-whiteboard-style]')) return
  const style = doc.createElement('style')
  style.setAttribute('data-whiteboard-style', '')
  style.textContent = excalidrawCss
  doc.head.appendChild(style)
}

const insideExcalidraw = (event: KeyboardEvent): boolean => {
  const target = event.target
  return target instanceof Element && target.closest('.excalidraw') !== null
}

const OPEN_CHAT_LAYER = '[data-scope]:not([data-scope="tabs"])[data-part="content"][data-state="open"]'

const layerOpenBeside = (node: unknown): boolean => {
  if (!(node instanceof Node)) return false
  const root = node.getRootNode()
  return (root instanceof ShadowRoot || root instanceof Document) && root.querySelector(OPEN_CHAT_LAYER) !== null
}

const chatLayerOpen = (event: KeyboardEvent): boolean => layerOpenBeside(event.composedPath()[0])

const escapeLeftToOthers = (event: KeyboardEvent, layer: HTMLElement): boolean =>
  event.key !== 'Escape' || insideExcalidraw(event) || event.composedPath().includes(layer) || chatLayerOpen(event)

type SurfaceProps = {
  client: Context['client']
  room: string
  catchUpRetryMs: number
  visible: boolean
  layer: HTMLElement
  close: () => void
  bindComments: (comments: ChatCover | undefined) => void
}

function CanvasView(props: Pick<SurfaceProps, 'room' | 'visible' | 'layer'>): JSX.Element {
  const model = useComments()
  return (
    <>
      <Island doc={document} room={props.room} theme="dark" visible={props.visible} onViewport={model.setViewport} />
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
  injectExcalidrawCss(document)
  onMount(() =>
    makeEventListener(
      window,
      'keydown',
      (event) => {
        if (!props.visible || escapeLeftToOthers(event, props.layer)) return
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
        <CanvasView room={props.room} visible={props.visible} layer={props.layer} />
      </CommentsProvider>
    </WhiteboardDbProvider>
  )
}
