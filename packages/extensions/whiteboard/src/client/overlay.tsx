import {Show, createEffect, createRoot, createSignal, type Accessor, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {EnvironmentProvider} from '@mandarax/ui-kit-system'
import type {ClientApi} from '@mandarax/extension'
import type {ToolViewCtx} from '@mandarax/protocol/tool-view-types'
import type {OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import {mountIsland} from '../canvas/island.js'
import {roomId} from '../shared/room.js'
import {WhiteboardJazzProvider, type JazzConfig} from './jazz-client.js'
import {useCanvasBinding} from './canvas/binding.js'
import {PinsLayer} from './pins/pins.js'
import {Thread} from './pins/thread.js'

type MountOverlayOptions = {
  api: ClientApi
  config: JazzConfig
  open: Accessor<boolean>
  previewId: string
  sessionId: Accessor<string>
}

const threadCtx = (api: ClientApi): ToolViewCtx => ({apiBase: api.apiBase, harnessId: '', sendMessage: () => {}})

function Overlay(props: {
  api: ClientApi
  handle: ReturnType<typeof mountIsland>
  previewId: string
  sessionId: Accessor<string>
  setWriter: (writer: (next: readonly OrderedExcalidrawElement[]) => void) => void
}): JSX.Element {
  const writeLocal = useCanvasBinding({handle: props.handle, room: () => roomId(props.previewId, props.sessionId())})
  props.setWriter(writeLocal)
  const [openCid, setOpenCid] = createSignal<string | null>(null)
  return (
    <>
      <PinsLayer previewId={props.previewId} sessionId={props.sessionId()} onOpen={setOpenCid} />
      <Show when={openCid()}>
        {(cid) => (
          <Thread
            previewId={props.previewId}
            sessionId={props.sessionId()}
            rootCid={cid()}
            ctx={threadCtx(props.api)}
            onClose={() => setOpenCid(null)}
          />
        )}
      </Show>
    </>
  )
}

async function injectExcalidrawCss(doc: Document): Promise<void> {
  if (doc.head.querySelector('[data-whiteboard-style]')) return
  const sheet = await import('@excalidraw/excalidraw/index.css?inline')
  const style = doc.createElement('style')
  style.setAttribute('data-whiteboard-style', '')
  style.textContent = sheet.default
  doc.head.appendChild(style)
}

export function mountOverlay(options: MountOverlayOptions): () => void {
  const doc = options.api.env.doc
  void injectExcalidrawCss(doc)

  const host = doc.createElement('div')
  host.style.cssText = 'position:fixed;inset:0;z-index:2147482000;visibility:hidden'
  doc.body.appendChild(host)

  const surfaceRoot = options.api.surface()
  const layer = doc.createElement('div')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;visibility:hidden'
  surfaceRoot.appendChild(layer)

  let writer: (next: readonly OrderedExcalidrawElement[]) => void = () => {}
  const handle = mountIsland({
    container: host,
    initialElements: [],
    onUserChange: (elements) => writer(elements),
    onPointer: () => {},
    theme: 'light',
  })

  const disposeSolid = render(
    () => (
      <EnvironmentProvider value={() => layer.getRootNode()}>
        <WhiteboardJazzProvider config={options.config}>
          <Overlay
            api={options.api}
            handle={handle}
            previewId={options.previewId}
            sessionId={options.sessionId}
            setWriter={(next) => (writer = next)}
          />
        </WhiteboardJazzProvider>
      </EnvironmentProvider>
    ),
    layer,
  )

  const disposeVisibility = createRoot((dispose) => {
    createEffect(() => {
      const visibility = options.open() ? 'visible' : 'hidden'
      host.style.visibility = visibility
      layer.style.visibility = visibility
    })
    return dispose
  })

  return () => {
    disposeVisibility()
    disposeSolid()
    handle.destroy()
    host.remove()
    layer.remove()
  }
}
