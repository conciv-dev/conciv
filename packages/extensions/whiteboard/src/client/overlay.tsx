import {ErrorBoundary, Show, Suspense, createResource, createSignal, type Accessor, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {useDb} from 'jazz-tools/solid'
import type {JsonValue} from 'jazz-tools'
import {EnvironmentProvider} from '@mandarax/ui-kit-system'
import type {ClientApi} from '@mandarax/extension'
import type {ElementRect, ElementSource} from '@mandarax/grab'
import type {ToolViewCtx} from '@mandarax/protocol/tool-view-types'
import {Island, type Self} from '../canvas/island.js'
import {app} from '../shared/schema.js'
import {WhiteboardJazzProvider, fetchJazzConfig} from './jazz-client.js'
import {PinsLayer} from './pins/pins.js'
import {Thread} from './pins/thread.js'
import {Compose} from './pins/compose.js'

export type CommentPick = {source: ElementSource | null; rect: ElementRect | null}

const PALETTE = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'] as const

const NOTICE =
  'fixed inset-x-0 bottom-4 mx-auto w-fit pointer-events-none text-[0.8125rem] text-pw-text-2 bg-pw-panel border border-pw-line rounded-pw-lg shadow-pw-lg px-3 py-2'

const OverlayLoading = (): JSX.Element => <div class={NOTICE}>Loading the whiteboard…</div>
const SessionPending = (): JSX.Element => <div class={NOTICE}>Start a chat session to open the whiteboard.</div>

function OverlayError(props: {error: unknown; onToast: ClientApi['toast']}): JSX.Element {
  props.onToast('The whiteboard needs a running mandarax server', 'error')
  return <div class={NOTICE}>The whiteboard is unavailable.</div>
}

function selfIdentity(win: Window): Self {
  const key = 'mandarax-whiteboard-presence-id'
  const peerId = win.sessionStorage.getItem(key) ?? crypto.randomUUID()
  win.sessionStorage.setItem(key, peerId)
  const index = Array.from(peerId).reduce((sum, char) => sum + char.charCodeAt(0), 0) % PALETTE.length
  return {peerId, name: `Guest ${peerId.slice(0, 4)}`, color: PALETTE[index] ?? PALETTE[0]}
}

type MountOverlayOptions = {
  api: ClientApi
  open: Accessor<boolean>
  registerComment: (write: (pick: CommentPick) => void) => void
}

type CanvasProps = {
  api: ClientApi
  doc: Document
  visible: Accessor<boolean>
  room: Accessor<string>
  self: Self
  registerComment: (write: (pick: CommentPick) => void) => void
}

const threadCtx = (api: ClientApi): ToolViewCtx => ({apiBase: api.apiBase, harnessId: '', sendMessage: () => {}})

// The Island mounts here so it never binds without a real session; the keyed <Show> above re-mounts
// it on session switch, so its onCleanup tears down the old room's subscriptions and cursor row.
function Canvas(props: CanvasProps): JSX.Element {
  const db = useDb()
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
      sessionId: props.room(),
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
    db().insert(app.pins, {room: props.room(), cid, x: center.x, y: center.y, pinState: 'locked'})
    setComposePick(null)
    setOpenCid(cid)
  }

  return (
    <>
      <Island doc={props.doc} room={props.room()} theme="light" self={props.self} visible={props.visible()} />
      <Show when={props.visible()}>
        <PinsLayer room={props.room()} onOpen={setOpenCid} />
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
            <Thread room={props.room()} rootCid={cid()} ctx={threadCtx(props.api)} onClose={() => setOpenCid(null)} />
          )}
        </Show>
      </Show>
    </>
  )
}

// Loads the jazz config under <Suspense>; a config-fetch reject throws to the <ErrorBoundary> above.
// The session gate is keyed so Canvas (and its presence write identity) re-mounts on session switch.
function Board(props: {
  api: ClientApi
  doc: Document
  visible: Accessor<boolean>
  self: Self
  registerComment: (write: (pick: CommentPick) => void) => void
}): JSX.Element {
  const [config] = createResource(() => fetchJazzConfig(`${props.api.apiBase}/api/ext/whiteboard`))
  return (
    <Show when={config()} keyed>
      {(jazzConfig) => (
        <WhiteboardJazzProvider config={jazzConfig} fallback={<OverlayLoading />}>
          <Show when={props.api.activeSession()} keyed fallback={<SessionPending />}>
            {(session) => (
              <Canvas
                api={props.api}
                doc={props.doc}
                visible={props.visible}
                room={() => session}
                self={props.self}
                registerComment={props.registerComment}
              />
            )}
          </Show>
        </WhiteboardJazzProvider>
      )}
    </Show>
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

  // The Excalidraw canvas owns its own light-DOM container (the Island's <Portal>); this surface only
  // holds the shadow-DOM pin/comment UI (Ark popovers need the EnvironmentProvider shadow root).
  const surfaceRoot = options.api.surface()
  const layer = doc.createElement('div')
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none'
  surfaceRoot.appendChild(layer)

  const disposeSolid = render(
    () => (
      <EnvironmentProvider value={() => layer.getRootNode()}>
        <ErrorBoundary fallback={(error) => <OverlayError error={error} onToast={options.api.toast} />}>
          <Suspense fallback={<OverlayLoading />}>
            <Board
              api={options.api}
              doc={doc}
              visible={options.open}
              self={selfIdentity(options.api.env.win)}
              registerComment={options.registerComment}
            />
          </Suspense>
        </ErrorBoundary>
      </EnvironmentProvider>
    ),
    layer,
  )

  return () => {
    disposeSolid()
    layer.remove()
  }
}
