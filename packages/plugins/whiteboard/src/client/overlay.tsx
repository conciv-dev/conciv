import {ErrorBoundary, onMount, Show, Suspense, lazy, type JSX} from 'solid-js'
import type {Context} from '@conciv/plugin/experimental'

const CanvasSurface = lazy(() => import('./canvas-surface.js'))

const NOTICE =
  'fixed inset-x-0 bottom-4 mx-auto w-fit max-w-[calc(100vw-2rem)] pointer-events-none text-chat-sm text-chat-text-2 bg-chat-panel border border-chat-line rounded-chat-surface-lg shadow-chat-lg px-3 py-2'

function Notice(props: {children: string}): JSX.Element {
  return (
    <div role="status" class={NOTICE}>
      {props.children}
    </div>
  )
}

function OverlayError(props: {toast: Context['toast']; error: unknown}): JSX.Element {
  onMount(() => {
    console.error('[whiteboard] the canvas failed to open', props.error)
    props.toast.show({title: 'The whiteboard needs a running conciv server', variant: 'error'})
  })
  return <Notice>The whiteboard is unavailable.</Notice>
}

export function WhiteboardOverlay(props: {ctx: Context; close: () => void}): JSX.Element {
  const room = () => {
    const session = props.ctx.sessions.current()
    return session && !session.pending ? session.id : undefined
  }
  return (
    <div class="text-chat-text font-chat pointer-events-none inset-0 fixed">
      <ErrorBoundary fallback={(error) => <OverlayError toast={props.ctx.toast} error={error} />}>
        <Suspense fallback={<Notice>Loading the whiteboard…</Notice>}>
          <Show when={room()} keyed fallback={<Notice>Start a chat session to open the whiteboard.</Notice>}>
            {(current) => <CanvasSurface client={props.ctx.client} room={current} close={props.close} />}
          </Show>
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}
