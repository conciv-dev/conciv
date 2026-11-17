import {createMemo, Show, untrack, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createTerminalModel, Terminal, type TerminalTheme} from '@conciv/ui-kit-terminal'
import {engineWebSocket} from '@conciv/contract'
import {createKeyed, usePlugin, type MountedSession, type ServerRef} from '@conciv/plugin/experimental'

const ESCAPE_KEY = String.fromCharCode(27)
const OPEN_FAILED = 'Couldn’t open the terminal.'
const PANEL_KEY = 'terminal:terminal'

type TerminalSize = {readonly cols: number; readonly rows: number}

function readTerminalTheme(element: Element): TerminalTheme {
  const tokens = getComputedStyle(element)
  const token = (name: string, fallback: string): string => tokens.getPropertyValue(name).trim() || fallback
  return {
    background: token('--chat-bg', '#101014'),
    foreground: token('--chat-text-hi', '#d6d6de'),
    cursor: token('--chat-text-hi', '#d6d6de'),
    selectionBackground: token('--chat-fill-strong', '#3a3a44'),
  }
}

async function connectUrl(server: ServerRef, sessionId: string, size: TerminalSize): Promise<string> {
  const terminal = server.client.experimental.persistentPty
  const pty = await terminal.create({sessionId, size: {cols: size.cols, rows: size.rows}})
  const {ticket} = await terminal.connectToken({ptyId: pty.id})
  const url = new URL(`${server.url}/api/experimental/persistent-pty/${pty.id}/connect`, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('ticket', ticket)
  url.searchParams.set('cols', String(size.cols))
  url.searchParams.set('rows', String(size.rows))
  return url.toString()
}

function TerminalSurface(props: {
  session: MountedSession
  themeHost: () => Element
  failed: (message: string) => void
}): JSX.Element {
  const ctx = usePlugin()
  const server = untrack(() => props.session.server)
  const sessionId = untrack(() => props.session.id)
  const opened = {url: ''}
  const model = createTerminalModel({
    url: () => opened.url,
    socket: engineWebSocket(server.url),
    beforeConnect: async (terminal) => {
      opened.url = await connectUrl(server, sessionId, terminal).catch((cause: unknown) => {
        console.error('[terminal] opening the session terminal failed', cause)
        ctx.toast.show({title: OPEN_FAILED, variant: 'error'})
        props.failed(OPEN_FAILED)
        throw new Error(OPEN_FAILED)
      })
    },
    theme: () => readTerminalTheme(props.themeHost()),
  })
  createKeyed(
    () => ctx.appearance.mode(),
    () => {
      model.terminal.options.theme = readTerminalTheme(props.themeHost())
    },
  )
  makeEventListener(
    window,
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !model.busy()) return
      event.preventDefault()
      event.stopImmediatePropagation()
      model.sendInput(ESCAPE_KEY)
      model.focus()
    },
    {capture: true},
  )
  model.terminal.attachCustomKeyEventHandler((event) => {
    if (event.type === 'keydown' && event.key === 'Escape') event.preventDefault()
    return true
  })
  const keepFocus = (element: HTMLDivElement) =>
    makeEventListener(element, 'focusout', (event) => {
      if (event.relatedTarget !== null) return
      queueMicrotask(() => {
        if (element.ownerDocument.hasFocus()) model.focus()
      })
    })
  return (
    <div ref={keepFocus} class="flex flex-1 flex-col min-h-0">
      <Terminal model={model} onBackToChat={() => ctx.layout.close(PANEL_KEY, props.session)} class="flex-1 min-h-0" />
    </div>
  )
}

export function TerminalPanel(props: {session: MountedSession}): JSX.Element {
  const ctx = usePlugin()
  const [state, setState] = createStore<{attempt: number; failure: {key: string; message: string} | null}>({
    attempt: 0,
    failure: null,
  })
  const key = createMemo(() => `${props.session.id}:${state.attempt}`)
  const failure = createMemo(() => (state.failure?.key === key() ? state.failure.message : null))
  const host: {element: Element | undefined} = {element: undefined}
  const themeHost = () => host.element ?? document.body
  const retry = () => setState({attempt: state.attempt + 1, failure: null})
  return (
    <div
      ref={(element) => {
        host.element = element
      }}
      class="flex flex-1 flex-col min-h-0"
    >
      <Show
        when={failure()}
        fallback={
          <Show keyed when={key()}>
            {(current) => (
              <TerminalSurface
                session={props.session}
                themeHost={themeHost}
                failed={(message) => setState('failure', {key: current, message})}
              />
            )}
          </Show>
        }
      >
        {(message) => (
          <div class="p-2.5">
            <div
              class="text-xs text-chat-text px-3 py-2.5 border border-chat-danger-line rounded-chat-surface-md bg-chat-fill flex gap-2 items-center justify-between"
              role="alert"
            >
              <span>{message()}</span>
              <ctx.ui.Button variant="contrast" size="small" onClick={retry}>
                Retry
              </ctx.ui.Button>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
