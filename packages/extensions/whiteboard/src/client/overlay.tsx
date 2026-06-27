import {Show, createEffect, createRoot, createSignal, type Accessor, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {useDb} from 'jazz-tools/solid'
import type {JsonValue} from 'jazz-tools'
import {EnvironmentProvider} from '@mandarax/ui-kit-system'
import type {ClientApi} from '@mandarax/extension'
import type {ElementRect, ElementSource} from '@mandarax/grab'
import type {ToolViewCtx} from '@mandarax/protocol/tool-view-types'
import type {OrderedExcalidrawElement} from '@excalidraw/excalidraw/element/types'
import {mountIsland} from '../canvas/island.js'
import {app} from '../shared/schema.js'
import {roomId} from '../shared/room.js'
import {WhiteboardJazzProvider, type JazzConfig} from './jazz-client.js'
import {useCanvasBinding} from './canvas/binding.js'
import {useCursorPresence, type Self} from './canvas/presence.js'
import {PinsLayer} from './pins/pins.js'
import {Thread} from './pins/thread.js'
import {Compose} from './pins/compose.js'

export type CommentPick = {source: ElementSource | null; rect: ElementRect | null}

const PALETTE = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5']

function selfIdentity(win: Window): Self {
  const key = 'mandarax-whiteboard-presence-id'
  const sessionId = win.sessionStorage.getItem(key) ?? crypto.randomUUID()
  win.sessionStorage.setItem(key, sessionId)
  const index = Array.from(sessionId).reduce((sum, char) => sum + char.charCodeAt(0), 0) % PALETTE.length
  return {sessionId, name: `Guest ${sessionId.slice(0, 4)}`, color: PALETTE[index]!}
}

type MountOverlayOptions = {
  api: ClientApi
  config: JazzConfig
  open: Accessor<boolean>
  previewId: string
  sessionId: Accessor<string>
  registerComment: (write: (pick: CommentPick) => void) => void
}

const threadCtx = (api: ClientApi): ToolViewCtx => ({apiBase: api.apiBase, harnessId: '', sendMessage: () => {}})

function Overlay(props: {
  api: ClientApi
  handle: ReturnType<typeof mountIsland>
  previewId: string
  sessionId: Accessor<string>
  self: Self
  setWriter: (writer: (next: readonly OrderedExcalidrawElement[]) => void) => void
  setPointer: (pointer: (point: {x: number; y: number}) => void) => void
  registerComment: (write: (pick: CommentPick) => void) => void
}): JSX.Element {
  const db = useDb()
  const room = (): string => roomId(props.previewId, props.sessionId())
  const writeLocal = useCanvasBinding({handle: props.handle, room})
  props.setWriter(writeLocal)
  const setCursor = useCursorPresence({handle: props.handle, room, self: props.self})
  props.setPointer((point) => setCursor(point.x, point.y))
  const [openCid, setOpenCid] = createSignal<string | null>(null)
  const [composePick, setComposePick] = createSignal<CommentPick | null>(null)
  props.registerComment(setComposePick)

  const createComment = (pick: CommentPick, text: string): void => {
    const cid = crypto.randomUUID()
    const now = new Date()
    const center = pick.rect
      ? {x: pick.rect.x + pick.rect.width / 2, y: pick.rect.y + pick.rect.height / 2}
      : {x: 80, y: 80}
    db().insert(app.comments, {
      previewId: props.previewId,
      sessionId: props.sessionId(),
      cid,
      threadId: cid,
      parts: [{type: 'text', text}] as JsonValue,
      authorKind: 'human',
      status: 'open',
      kind: pick.source ? 'source-linked' : 'floating',
      anchor: pick.source
        ? ({source: {file: pick.source.filePath, line: pick.source.lineNumber ?? 1, column: 1}} as JsonValue)
        : undefined,
      anchorFile: pick.source?.filePath ?? undefined,
      createdAt: now,
      updatedAt: now,
    })
    db().insert(app.pins, {room: room(), cid, x: center.x, y: center.y, pinState: 'locked'})
    setComposePick(null)
    setOpenCid(cid)
  }

  return (
    <>
      <PinsLayer previewId={props.previewId} sessionId={props.sessionId()} onOpen={setOpenCid} />
      <Show when={composePick()}>
        {(pick) => (
          <Compose
            pick={pick()}
            onSubmit={(text) => createComment(pick(), text)}
            onCancel={() => setComposePick(null)}
          />
        )}
      </Show>
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
  injectExcalidrawCss(doc).catch(() => options.api.toast('Could not load the whiteboard styles', 'error'))

  const host = doc.createElement('div')
  host.style.cssText = 'position:fixed;inset:0;z-index:2147482000;visibility:hidden'
  doc.body.appendChild(host)

  const surfaceRoot = options.api.surface()
  const layer = doc.createElement('div')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;visibility:hidden'
  surfaceRoot.appendChild(layer)

  let writer: ((next: readonly OrderedExcalidrawElement[]) => void) | undefined
  let bufferedElements: readonly OrderedExcalidrawElement[] | undefined
  let pointer: ((point: {x: number; y: number}) => void) | undefined
  const handle = mountIsland({
    container: host,
    initialElements: [],
    onUserChange: (elements) => (writer ? writer(elements) : (bufferedElements = elements)),
    onPointer: (point) => pointer?.(point),
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
            self={selfIdentity(options.api.env.win)}
            setWriter={(next) => {
              writer = next
              if (bufferedElements) next(bufferedElements)
              bufferedElements = undefined
            }}
            setPointer={(next) => (pointer = next)}
            registerComment={options.registerComment}
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
