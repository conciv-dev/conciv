import {ErrorBoundary, Show, Suspense, lazy, type JSX} from 'solid-js'
import {getExtensionApi} from '@conciv/extension'
import {WHITEBOARD_NAME} from '../shared/meta.js'
import {WhiteboardDbProvider} from './db.js'
import type {Self, SurfaceState} from './surface-types.js'

const CanvasSurface = lazy(() => import('./canvas-surface.js'))

const PALETTE = ['#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'] as const

const NOTICE =
  'fixed inset-x-0 bottom-4 mx-auto w-fit pointer-events-none text-[0.8125rem] text-chat-text-2 bg-chat-panel border border-chat-line rounded-chat-surface-lg shadow-chat-lg px-3 py-2'

const OverlayLoading = (): JSX.Element => <div class={NOTICE}>Loading the whiteboard…</div>
const SessionPending = (): JSX.Element => <div class={NOTICE}>Start a chat session to open the whiteboard.</div>

function OverlayError(): JSX.Element {
  const toast = getExtensionApi(WHITEBOARD_NAME).useToast()
  toast('The whiteboard needs a running conciv server', 'error')
  return <div class={NOTICE}>The whiteboard is unavailable.</div>
}

function selfIdentity(win: Window): Self {
  const key = 'conciv-whiteboard-presence-id'
  const peerId = win.sessionStorage.getItem(key) ?? crypto.randomUUID()
  win.sessionStorage.setItem(key, peerId)
  const index = Array.from(peerId).reduce((sum, char) => sum + char.charCodeAt(0), 0) % PALETTE.length
  return {peerId, name: `Guest ${peerId.slice(0, 4)}`, color: PALETTE[index] ?? PALETTE[0]}
}

function Board(props: {state: SurfaceState}): JSX.Element {
  const host = getExtensionApi(WHITEBOARD_NAME)
  const sessionId = host.useSessionId()
  const apiBase = host.useApiBase()
  return (
    <Show when={sessionId()} keyed fallback={<SessionPending />}>
      {(session) => (
        <WhiteboardDbProvider apiBase={apiBase()} room={session}>
          <CanvasSurface state={props.state} room={() => session} self={selfIdentity(window)} />
        </WhiteboardDbProvider>
      )}
    </Show>
  )
}

export function WhiteboardSurface(props: {state: SurfaceState}): JSX.Element {
  const {YieldFocus} = getExtensionApi(WHITEBOARD_NAME)
  return (
    <Show when={props.state.engaged()}>
      <div class="text-chat-text font-chat pointer-events-none inset-0 fixed">
        <YieldFocus when={props.state.visible()}>
          <ErrorBoundary fallback={<OverlayError />}>
            <Suspense fallback={<OverlayLoading />}>
              <Board state={props.state} />
            </Suspense>
          </ErrorBoundary>
        </YieldFocus>
      </div>
    </Show>
  )
}
