import {onCleanup, untrack, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createTerminalModel, Terminal, type TerminalTheme} from '@conciv/ui-kit-terminal'
import {engineWebSocket} from '@conciv/contract'
import {createKeyed, usePlugin, type MountedSession, type ServerRef} from '@conciv/plugin/experimental'
import {OPEN_FAILED, PANEL_KEY, type TerminalState} from './terminal-state.js'

const ESCAPE_KEY = String.fromCharCode(27)

type TerminalSize = {readonly cols: number; readonly rows: number}

type PtyRequest = {readonly sessionId: string; readonly size: TerminalSize; readonly model: string | undefined}

function resolvedColor(probe: HTMLElement, token: string): string | undefined {
  probe.style.color = `var(${token})`
  const color = getComputedStyle(probe).color
  return color === '' ? undefined : color
}

function readTerminalTheme(element: Element): TerminalTheme {
  const probe = document.createElement('span')
  element.append(probe)
  const text = resolvedColor(probe, '--chat-text-hi')
  const theme = {
    background: resolvedColor(probe, '--chat-panel'),
    foreground: text,
    cursor: text,
    selectionBackground: resolvedColor(probe, '--chat-fill-strong'),
  }
  probe.remove()
  return theme
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

export default function TerminalSurface(props: {
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
  onCleanup(() => props.terminal.closed(terminalKey))
  model.terminal.attachCustomKeyEventHandler((event) => {
    if (event.type === 'keydown' && event.key === 'Escape') event.preventDefault()
    return true
  })
  const surface = (element: HTMLDivElement) => {
    makeEventListener(
      element,
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || !model.busy()) return
        event.preventDefault()
        event.stopImmediatePropagation()
        model.sendInput(ESCAPE_KEY)
      },
      {capture: true},
    )
    makeEventListener(element, 'focusout', (event) => {
      if (event.relatedTarget !== null) return
      queueMicrotask(() => {
        if (element.ownerDocument.hasFocus()) model.focus()
      })
    })
  }
  return (
    <div ref={surface} class="flex flex-1 flex-col min-h-0">
      <Terminal model={model} onBackToChat={() => ctx.layout.close(PANEL_KEY, props.session)} class="flex-1 min-h-0" />
    </div>
  )
}
