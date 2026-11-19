import {createMemo, ErrorBoundary, Match, onCleanup, onMount, Show, Switch, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {UseQueryResult} from '@conciv/client'
import type {Context} from '@conciv/plugin/experimental'
import {Effect} from 'effect'
import {z} from 'zod'
import type {ChatCover} from './comments-model.js'

type CanvasSurface = UseQueryResult<(typeof import('./canvas-surface.js'))['default']>

function reportFailure(toast: Context['toast'], error: unknown): void {
  Effect.runFork(
    Effect.logError('the canvas failed to open', error).pipe(
      Effect.annotateLogs({plugin: 'whiteboard', surface: 'canvas'}),
    ),
  )
  toast.show({title: 'The whiteboard needs a running conciv server', variant: 'error'})
}

function CanvasFailed(props: {toast: Context['toast']; error: unknown}): JSX.Element {
  onMount(() => reportFailure(props.toast, props.error))
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
const TRANSPARENT = 'transparent'
const CanvasOptions = z.object({
  catchUpRetryMs: z.number().positive().default(CATCH_UP_RETRY_MS).catch(CATCH_UP_RETRY_MS),
  background: z
    .string()
    .refine((colour) => CSS.supports('color', colour))
    .default(TRANSPARENT)
    .catch(TRANSPARENT),
})

function readRoom(ctx: Context): string | undefined {
  const session = ctx.sessions.current()
  return session && !session.pending ? session.id : undefined
}

export function WhiteboardNotices(props: {ctx: Context; surface: CanvasSurface; layer: HTMLElement}): JSX.Element {
  return (
    <div class="text-chat-text font-chat pointer-events-none inset-0 fixed -z-1">
      <Switch>
        <Match when={props.surface.isLoading}>
          <Notice toast={props.ctx.toast} title="Loading the whiteboard…" variant="loading" />
        </Match>
        <Match when={props.surface.error} keyed>
          {(error) => <CanvasFailed toast={props.ctx.toast} error={error} />}
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
  surface: CanvasSurface
  visible: boolean
  layer: HTMLElement
  close: () => void
  bindComments: (comments: ChatCover | undefined) => void
}): JSX.Element {
  const options = createMemo(() => CanvasOptions.parse(props.ctx.options))
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
                catchUpRetryMs={options().catchUpRetryMs}
                background={options().background}
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
