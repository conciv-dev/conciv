import {createMemo, ErrorBoundary, lazy, Show, Suspense, type JSX} from 'solid-js'
import {usePlugin, type MountedSession} from '@conciv/plugin/experimental'
import {OPEN_FAILED, type TerminalState} from './terminal-state.js'
import {TerminalToolbar} from './terminal-toolbar.js'

const TerminalSurface = lazy(() => import('./terminal-surface.js'))

function FailureNotice(props: {message: string; onRetry: () => void}): JSX.Element {
  const ctx = usePlugin()
  return (
    <div class="p-2.5">
      <div
        class="text-chat-xs text-chat-text px-3 py-2.5 border border-chat-danger-line rounded-chat-surface-md bg-chat-fill flex gap-2 items-center justify-between"
        role="alert"
      >
        <span>{props.message}</span>
        <ctx.ui.Button variant="contrast" size="small" onClick={() => props.onRetry()}>
          Retry
        </ctx.ui.Button>
      </div>
    </div>
  )
}

export function TerminalPanel(props: {session: MountedSession; terminal: TerminalState}): JSX.Element {
  const key = createMemo(() => props.terminal.key(props.session.id))
  const failure = createMemo(() => props.terminal.failure(props.session.id))
  let host: HTMLDivElement | undefined
  const themeHost = () => host ?? document.body
  return (
    <div
      ref={(element) => {
        host = element
      }}
      class="flex flex-1 flex-col min-h-0"
    >
      <TerminalToolbar session={props.session} terminal={props.terminal} />
      <Show
        when={failure()}
        fallback={
          <Show when={props.terminal.ready(props.session.id)}>
            <Show keyed when={key()}>
              {(current) => (
                <ErrorBoundary
                  fallback={(cause: unknown, reset) => {
                    console.error('[terminal] loading the session terminal failed', cause)
                    return <FailureNotice message={OPEN_FAILED} onRetry={reset} />
                  }}
                >
                  <Suspense>
                    <TerminalSurface
                      session={props.session}
                      terminal={props.terminal}
                      terminalKey={current}
                      themeHost={themeHost}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </Show>
          </Show>
        }
      >
        {(message) => <FailureNotice message={message()} onRetry={() => props.terminal.retry()} />}
      </Show>
    </div>
  )
}
