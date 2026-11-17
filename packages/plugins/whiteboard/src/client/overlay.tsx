import {ErrorBoundary, Match, onMount, Show, Switch, type JSX, type Resource} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {Context} from '@conciv/plugin/experimental'

export type SurfaceModule = typeof import('./canvas-surface.js')

const NOTICE =
  'fixed inset-x-0 bottom-4 mx-auto w-fit max-w-[calc(100vw-2rem)] pointer-events-none text-chat-sm text-chat-text-2 bg-chat-panel border border-chat-line rounded-chat-surface-lg shadow-chat-lg px-3 py-2'

function Notice(props: {children: string}): JSX.Element {
  return (
    <div role="status" class={NOTICE}>
      {props.children}
    </div>
  )
}

function reportFailure(toast: Context['toast'], error: unknown): void {
  console.error('[whiteboard] the canvas failed to open', error)
  toast.show({title: 'The whiteboard needs a running conciv server', variant: 'error'})
}

function OverlayError(props: {toast: Context['toast']; error: unknown}): JSX.Element {
  onMount(() => reportFailure(props.toast, props.error))
  return <Notice>The whiteboard is unavailable.</Notice>
}

function CanvasFailed(props: {toast: Context['toast']; error: unknown}): JSX.Element {
  onMount(() => reportFailure(props.toast, props.error))
  return undefined
}

function readRoom(ctx: Context): string | undefined {
  const session = ctx.sessions.current()
  return session && !session.pending ? session.id : undefined
}

export function WhiteboardNotices(props: {ctx: Context; surface: Resource<SurfaceModule>}): JSX.Element {
  return (
    <div class="text-chat-text font-chat pointer-events-none inset-0 fixed">
      <Switch>
        <Match when={props.surface.error !== undefined}>
          <OverlayError toast={props.ctx.toast} error={props.surface.error} />
        </Match>
        <Match when={props.surface.loading}>
          <Notice>Loading the whiteboard…</Notice>
        </Match>
        <Match when={readRoom(props.ctx) === undefined}>
          <Notice>Start a chat session to open the whiteboard.</Notice>
        </Match>
      </Switch>
    </div>
  )
}

export function WhiteboardCanvas(props: {
  ctx: Context
  surface: Resource<SurfaceModule>
  visible: boolean
  close: () => void
}): JSX.Element {
  const module = (): SurfaceModule | undefined => (props.surface.state === 'ready' ? props.surface() : undefined)
  return (
    <ErrorBoundary fallback={(error) => <CanvasFailed toast={props.ctx.toast} error={error} />}>
      <Show when={module()}>
        {(loaded) => (
          <Show when={readRoom(props.ctx)} keyed>
            {(current) => (
              <Dynamic
                component={loaded().default}
                client={props.ctx.client}
                room={current}
                visible={props.visible}
                close={props.close}
              />
            )}
          </Show>
        )}
      </Show>
    </ErrorBoundary>
  )
}
