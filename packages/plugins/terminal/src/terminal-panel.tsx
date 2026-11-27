import {createMemo, ErrorBoundary, lazy, Show, Suspense, type JSX} from 'solid-js'
import {usePlugin, type MountedSession} from '@conciv/frontend-plugin-api'
import {EvlogError} from 'evlog'
import {terminalErrors} from './errors/errors.js'
import type {TerminalState} from './terminal-state.js'
import {TerminalToolbar} from './terminal-toolbar.js'

const TerminalSurface = lazy(() => import('./terminal-surface.js'))

function FailureNotice(props: {error: EvlogError; onRetry: () => void}): JSX.Element {
  const ctx = usePlugin()
  return (
    <div class="p-2.5">
      <div
        class="text-chat-xs text-chat-text px-3 py-2.5 border border-chat-danger-line rounded-chat-surface-md bg-chat-fill flex gap-2 items-center justify-between"
        role="alert"
      >
        <span class="flex flex-col gap-1">
          <span>{props.error.message}</span>
          <Show when={props.error.fix}>{(fix) => <span class="text-chat-dim">{fix()}</span>}</Show>
        </span>
        <ctx.ui.Button variant="contrast" size="small" onClick={() => props.onRetry()}>
          Retry
        </ctx.ui.Button>
      </div>
    </div>
  )
}

export function TerminalPanel(props: {session: MountedSession; terminal: TerminalState}): JSX.Element {
  const ctx = usePlugin()
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
                    ctx.log.error({
                      action: 'terminal',
                      message: 'loading the session terminal failed',
                      sessionId: props.session.id,
                      error: cause,
                    })
                    return (
                      <FailureNotice
                        error={
                          EvlogError.isEvlogError(cause)
                            ? cause
                            : terminalErrors.OPEN_FAILED({cause: cause instanceof Error ? cause : undefined})
                        }
                        onRetry={reset}
                      />
                    )
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
        {(error) => <FailureNotice error={error()} onRetry={() => props.terminal.retry()} />}
      </Show>
    </div>
  )
}
