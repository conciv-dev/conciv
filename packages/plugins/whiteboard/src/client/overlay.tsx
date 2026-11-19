import {ErrorBoundary, Match, onMount, Show, Switch, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {UseQueryResult} from '@conciv/client'
import type {Context} from '@conciv/plugin/experimental'
import {z} from 'zod'

type CanvasSurface = UseQueryResult<(typeof import('./canvas-surface.js'))['default']>

const NOTICE =
  'fixed inset-x-4 bottom-4 mx-auto w-fit pointer-events-none text-chat-sm text-chat-text-2 bg-chat-panel border border-chat-line rounded-chat-surface-lg shadow-chat-lg px-3 py-2'

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

const CATCH_UP_RETRY_MS = 1_000
const CanvasOptions = z.object({
  catchUpRetryMs: z.number().positive().default(CATCH_UP_RETRY_MS).catch(CATCH_UP_RETRY_MS),
})

function readRoom(ctx: Context): string | undefined {
  const session = ctx.sessions.current()
  return session && !session.pending ? session.id : undefined
}

export function WhiteboardNotices(props: {ctx: Context; surface: CanvasSurface}): JSX.Element {
  return (
    <div class="text-chat-text font-chat pointer-events-none inset-0 fixed">
      <Switch>
        <Match when={props.surface.error} keyed>
          {(error) => <OverlayError toast={props.ctx.toast} error={error} />}
        </Match>
        <Match when={props.surface.isLoading}>
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
  surface: CanvasSurface
  visible: boolean
  close: () => void
}): JSX.Element {
  return (
    <ErrorBoundary fallback={(error) => <CanvasFailed toast={props.ctx.toast} error={error} />}>
      <Show when={props.surface.isSuccess && props.surface.data}>
        {(loaded) => (
          <Show when={readRoom(props.ctx)} keyed>
            {(current) => (
              <Dynamic
                component={loaded()}
                client={props.ctx.client}
                room={current}
                catchUpRetryMs={CanvasOptions.parse(props.ctx.options).catchUpRetryMs}
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
