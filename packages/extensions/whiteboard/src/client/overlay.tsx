import {ErrorBoundary, Show, Suspense, createResource, onCleanup, onMount, type Accessor, type JSX} from 'solid-js'
import {render} from 'solid-js/web'
import {EnvironmentProvider} from '@mandarax/ui-kit-system'
import type {ClientApi} from '@mandarax/extension'
import type {ElementRect, ElementSource} from '@mandarax/grab'
import {Island, type Self} from '../canvas/island.js'
import {WhiteboardJazzProvider, fetchJazzConfig} from './jazz-client.js'
import {CommentsProvider, useComments, type ComposeTarget} from './model/comments.js'
import {Inbox, InboxToggle} from './inbox.js'
import {PinsLayer} from './pins/pins.js'
import {ThreadPopover} from './pins/thread.js'
import {Compose} from './pins/compose.js'

export type CommentPick = {source: ElementSource | null; rect: ElementRect | null}

const toComposeTarget = (pick: CommentPick): ComposeTarget => ({
  source: pick.source ? {file: pick.source.filePath, line: pick.source.lineNumber ?? null} : null,
  screen: pick.rect ? {x: pick.rect.x + pick.rect.width / 2, y: pick.rect.y + pick.rect.height / 2} : {x: 80, y: 80},
})

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
  close: () => void
  registerComment: (write: (pick: CommentPick) => void) => void
}

// The view layer: it reads everything it needs from the comments model and renders. The Island mounts
// here so it never binds without a real session; the keyed <Show> below re-mounts it on session switch.
function CanvasView(props: {
  doc: Document
  visible: Accessor<boolean>
  room: Accessor<string>
  self: Self
  close: () => void
}): JSX.Element {
  const model = useComments()
  // Escape closes the canvas — but only when it's the sole thing open. Runs in the CAPTURE phase so it
  // reads the overlay state BEFORE Ark's own Escape handler mutates it (otherwise a thread's Escape would
  // clear openCid first and this would then also close the canvas). Skips when a thread/compose/inbox is
  // open (they own their Escape) or the keypress is inside the Excalidraw editor (where Escape deselects).
  onMount(() => {
    const win = props.doc.defaultView
    if (!win) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !props.visible()) return
      if (model.openCid() || model.composeTarget() || model.inboxOpen()) return
      if ((event.target as Element | null)?.closest?.('.excalidraw')) return
      props.close()
    }
    win.addEventListener('keydown', onKey, true)
    onCleanup(() => win.removeEventListener('keydown', onKey, true))
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
        <Show when={model.composeTarget()}>{(target) => <Compose target={target()} />}</Show>
        <ThreadPopover />
        <InboxToggle />
        <Inbox />
      </Show>
    </>
  )
}

function Canvas(props: {
  api: ClientApi
  doc: Document
  visible: Accessor<boolean>
  room: Accessor<string>
  self: Self
  close: () => void
  registerComment: (write: (pick: CommentPick) => void) => void
}): JSX.Element {
  return (
    <CommentsProvider room={props.room} apiBase={props.api.apiBase} suppressWhile={props.api.suppressWhile}>
      <ComposeBridge registerComment={props.registerComment} />
      <CanvasView doc={props.doc} visible={props.visible} room={props.room} self={props.self} close={props.close} />
    </CommentsProvider>
  )
}

// Bridges the extension's "leave a comment" affordance to the model, inside the provider.
function ComposeBridge(props: {registerComment: (write: (pick: CommentPick) => void) => void}): JSX.Element {
  const model = useComments()
  props.registerComment((pick) => model.startCompose(toComposeTarget(pick)))
  return <></>
}

// Loads the jazz config under <Suspense>; a config-fetch reject throws to the <ErrorBoundary> above.
// The session gate is keyed so Canvas (and its presence write identity) re-mounts on session switch.
function Board(props: {
  api: ClientApi
  doc: Document
  visible: Accessor<boolean>
  self: Self
  close: () => void
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
                close={props.close}
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
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:var(--pw-font);color:var(--pw-text)'
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
              close={options.close}
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
