import {onCleanup, onMount, untrack, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createTerminalModel, Terminal, type TerminalTheme} from '@conciv/ui-kit-terminal'
import {engineWebSocket} from '@conciv/contract'
import {createKeyed, usePlugin, type MountedSession, type ServerRef} from '@conciv/plugin/experimental'
import {OPEN_FAILED, PANEL_KEY, type TerminalState} from './terminal-state.js'

const ESCAPE_KEY = String.fromCharCode(27)

type TerminalSize = {readonly cols: number; readonly rows: number}

type PtyRequest = {readonly sessionId: string; readonly terminal: TerminalSize; readonly model: string | undefined}

function resolvedColor(probe: HTMLElement, token: string): string | undefined {
  probe.style.color = `var(${token})`
  const color = getComputedStyle(probe).color
  return color === '' ? undefined : color
}

function readTerminalTheme(element: Element, scheme: 'light' | 'dark'): TerminalTheme {
  const probe = document.createElement('span')
  probe.style.colorScheme = scheme
  element.append(probe)
  const text = resolvedColor(probe, '--chat-text-hi')
  const theme = {
    background: resolvedColor(probe, '--chat-bg'),
    foreground: text,
    cursor: text,
    selectionBackground: resolvedColor(probe, '--chat-fill-strong'),
  }
  probe.remove()
  return theme
}

function readTerminalFont(element: Element, font: string): string {
  const probe = document.createElement('span')
  probe.style.fontFamily = font
  element.append(probe)
  const family = getComputedStyle(probe).fontFamily
  probe.remove()
  return family === '' ? font : family
}

function takesFocusOnPress(node: EventTarget, view: Window & typeof globalThis): boolean {
  if (!(node instanceof view.HTMLElement) || node.matches(':disabled')) return false
  return node.tabIndex >= 0 || node.hasAttribute('tabindex')
}

function keepFocusInsideTheWidget(element: HTMLElement): void {
  const root = element.getRootNode()
  const view = element.ownerDocument.defaultView
  if (view === null || !(root instanceof view.ShadowRoot || root instanceof view.Document)) return
  makeEventListener(root, 'mousedown', (event) => {
    if (!element.contains(root.activeElement)) return
    if (event.composedPath().some((node) => node === element || takesFocusOnPress(node, view))) return
    event.preventDefault()
  })
}

async function openPty(server: ServerRef, request: PtyRequest): Promise<{ptyId: string; url: string}> {
  const terminal = server.client.experimental.persistentPty
  const size = {cols: request.terminal.cols, rows: request.terminal.rows}
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
    beforeConnect: async (terminal) => {
      const request = {sessionId, terminal, model: untrack(() => props.terminal.spawnModel(sessionId))}
      const pty = await openPty(server, request).catch((cause: unknown) => {
        console.error('[terminal] opening the session terminal failed', cause)
        ctx.toast.show({title: OPEN_FAILED, variant: 'error'})
        props.terminal.fail(terminalKey, OPEN_FAILED)
        throw new Error(OPEN_FAILED, {cause})
      })
      connection.url = pty.url
      props.terminal.opened({key: terminalKey, ptyId: pty.ptyId, busy: model.busy})
    },
    theme: () =>
      readTerminalTheme(
        props.themeHost(),
        untrack(() => ctx.appearance.mode()),
      ),
  })
  model.terminal.options.fontFamily = readTerminalFont(
    untrack(() => props.themeHost()),
    ctx.appearance.font('mono'),
  )
  createKeyed(
    () => ctx.appearance.mode(),
    (scheme) => {
      model.terminal.options.theme = readTerminalTheme(props.themeHost(), scheme)
    },
  )
  onCleanup(() => props.terminal.closed(terminalKey))
  model.terminal.attachCustomKeyEventHandler((event) => {
    if (event.type === 'keydown' && event.key === 'Escape') event.preventDefault()
    return true
  })
  const interruptOnEscape = (element: HTMLDivElement) => {
    onMount(() => keepFocusInsideTheWidget(element))
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
  }
  return (
    <div ref={interruptOnEscape} class="flex flex-1 flex-col min-h-0">
      <Terminal model={model} onBackToChat={() => ctx.layout.close(PANEL_KEY, props.session)} class="flex-1 min-h-0" />
    </div>
  )
}
