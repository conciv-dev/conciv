import {createMemo, onCleanup, Show, untrack, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createTerminalModel, Terminal, type TerminalTheme} from '@conciv/ui-kit-terminal'
import {engineWebSocket} from '@conciv/contract'
import {createKeyed, usePlugin, type MountedSession, type ServerRef} from '@conciv/plugin/experimental'
import {PANEL_KEY, type TerminalState} from './terminal-state.js'

const ESCAPE_KEY = String.fromCharCode(27)
const OPEN_FAILED = 'Couldn’t open the terminal.'

type TerminalSize = {readonly cols: number; readonly rows: number}

type PtyRequest = {readonly sessionId: string; readonly size: TerminalSize; readonly model: string | undefined}

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

async function openPty(server: ServerRef, request: PtyRequest): Promise<{ptyId: string; url: string}> {
  const terminal = server.client.experimental.persistentPty
  const size = {cols: request.size.cols, rows: request.size.rows}
  const pty = await terminal.create({sessionId: request.sessionId, size, model: request.model})
  const {ticket} = await terminal.connectToken({ptyId: pty.id})
  const url = new URL(`${server.url}/api/experimental/persistent-pty/${pty.id}/connect`, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('ticket', ticket)
  url.searchParams.set('cols', String(size.cols))
  url.searchParams.set('rows', String(size.rows))
  return {ptyId: pty.id, url: url.toString()}
}

function TerminalSurface(props: {
  session: MountedSession
  terminal: TerminalState
  terminalKey: string
  themeHost: () => Element
}): JSX.Element {
  const ctx = usePlugin()
  const server = untrack(() => props.session.server)
  const sessionId = untrack(() => props.session.id)
  const terminalKey = untrack(() => props.terminalKey)
  const connection = {url: ''}
  const model = createTerminalModel({
    url: () => connection.url,
    socket: engineWebSocket(server.url),
    beforeConnect: async (size) => {
      const request = {sessionId, size, model: untrack(() => props.terminal.spawnModel(sessionId))}
      const pty = await openPty(server, request).catch((cause: unknown) => {
        console.error('[terminal] opening the session terminal failed', cause)
        ctx.toast.show({title: OPEN_FAILED, variant: 'error'})
        props.terminal.fail(terminalKey, OPEN_FAILED)
        throw new Error(OPEN_FAILED)
      })
      connection.url = pty.url
      props.terminal.opened({key: terminalKey, ptyId: pty.ptyId, busy: model.busy})
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
  onCleanup(() => props.terminal.closed(terminalKey))
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

export function TerminalPanel(props: {session: MountedSession; terminal: TerminalState}): JSX.Element {
  const ctx = usePlugin()
  const key = createMemo(() => props.terminal.key(props.session.id))
  const failure = createMemo(() => props.terminal.failure(props.session.id))
  const host: {element: Element | undefined} = {element: undefined}
  const themeHost = () => host.element ?? document.body
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
                terminal={props.terminal}
                terminalKey={current}
                themeHost={themeHost}
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
              <ctx.ui.Button variant="contrast" size="small" onClick={() => props.terminal.retry()}>
                Retry
              </ctx.ui.Button>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
