import {ErrorBoundary, Match, onCleanup, onMount, Show, Switch, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {UseQueryResult} from '@conciv/client'
import type {Context} from '@conciv/plugin/experimental'
import {Effect} from 'effect'
import {z} from 'zod'
import type {ChatCover} from './comments-model.js'
import type {CanvasBackground} from './stores.js'
import type {WhiteboardRuntime} from './solid-runtime.js'

type CanvasSurface = UseQueryResult<(typeof import('./canvas-surface.js'))['default']>

function reportFailure(runtime: WhiteboardRuntime, toast: Context['toast'], error: unknown): void {
  runtime.runFork(
    Effect.logError('the canvas failed to open', error).pipe(
      Effect.annotateLogs({plugin: 'whiteboard', surface: 'canvas'}),
    ),
  )
  toast.show({title: 'The whiteboard needs a running conciv server', variant: 'error'})
}

function CanvasFailed(props: {runtime: WhiteboardRuntime; toast: Context['toast']; error: unknown}): JSX.Element {
  onMount(() => reportFailure(props.runtime, props.toast, props.error))
  return undefined
}

function Notice(props: {toast: Context['toast']; title: string; variant?: 'default' | 'loading'}): JSX.Element {
  onMount(() => {
    const shown = props.toast.show({title: props.title, variant: props.variant, persistent: true})
    onCleanup(() => shown.dismiss())
  })
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

export function WhiteboardNotices(props: {
  ctx: Context
  runtime: WhiteboardRuntime
  surface: CanvasSurface
  layer: HTMLElement
}): JSX.Element {
  return (
    <div class="text-chat-text font-chat pointer-events-none inset-0 fixed -z-1">
      <Switch>
        <Match when={props.surface.isLoading}>
          <Notice toast={props.ctx.toast} title="Loading the whiteboard…" variant="loading" />
        </Match>
        <Match when={props.surface.error} keyed>
          {(error) => <CanvasFailed runtime={props.runtime} toast={props.ctx.toast} error={error} />}
        </Match>
        <Match when={readRoom(props.ctx) === undefined}>
          <Notice toast={props.ctx.toast} title="Start a chat session to open the whiteboard." />
        </Match>
      </Switch>
      {props.layer}
    </div>
  )
}

export function WhiteboardCanvas(props: {
  ctx: Context
  runtime: WhiteboardRuntime
  surface: CanvasSurface
  background: CanvasBackground
  visible: boolean
  layer: HTMLElement
  close: () => void
  bindComments: (comments: ChatCover | undefined) => void
}): JSX.Element {
  return (
    <ErrorBoundary fallback={(error) => <CanvasFailed runtime={props.runtime} toast={props.ctx.toast} error={error} />}>
      <Show when={props.surface.isSuccess && props.surface.data}>
        {(loaded) => (
          <Show when={readRoom(props.ctx)} keyed>
            {(current) => (
              <Dynamic
                component={loaded()}
                runtime={props.runtime}
                client={props.ctx.client}
                room={current}
                catchUpRetryMs={CanvasOptions.parse(props.ctx.options).catchUpRetryMs}
                background={props.background}
                visible={props.visible}
                layer={props.layer}
                close={props.close}
                bindComments={props.bindComments}
              />
            )}
          </Show>
        )}
      </Show>
    </ErrorBoundary>
  )
}
