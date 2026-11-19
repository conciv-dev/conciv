import {onCleanup, onMount, untrack, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createTerminalModel, Terminal, type TerminalTheme} from '@conciv/ui-kit-terminal'
import {createKeyed, usePlugin, type MountedSession, type ServerRef} from '@conciv/plugin/experimental'
import {GrabApi} from '@conciv/plugin/experimental/grab'
import {OPEN_FAILED, PANEL_KEY, type TerminalState} from './terminal-state.js'
import {rpcTerminalTransport, type HeldPty} from './terminal-transport.js'

const ESCAPE_KEY = String.fromCharCode(27)

type TerminalSize = {readonly cols: number; readonly rows: number}

type PtyRequest = {readonly sessionId: string; readonly size: TerminalSize; readonly model: string | undefined}

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

function isPlainEnter(event: KeyboardEvent): boolean {
  if (event.isComposing || event.keyCode === 229) return false
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false
  return event.type === 'keydown' && event.key === 'Enter'
}

async function openPty(server: ServerRef, request: PtyRequest): Promise<string> {
  const size = {cols: request.size.cols, rows: request.size.rows}
  const pty = await server.client.experimental.persistentPty.create({
    sessionId: request.sessionId,
    size,
    model: request.model,
  })
  return pty.id
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
  const held: HeldPty = {ptyId: '', cursor: undefined}
  const model = createTerminalModel({
    transport: rpcTerminalTransport(server.client.experimental.persistentPty, held),
    beforeConnect: async (size) => {
      const request = {sessionId, size, model: untrack(() => props.terminal.spawnModel(sessionId))}
      const ptyId = await openPty(server, request).catch((cause: unknown) => {
        console.error('[terminal] opening the session terminal failed', cause)
        ctx.toast.show({title: OPEN_FAILED, variant: 'error'})
        props.terminal.fail(terminalKey, OPEN_FAILED)
        throw new Error(OPEN_FAILED, {cause})
      })
      if (held.ptyId !== ptyId) Object.assign(held, {ptyId, cursor: undefined})
      props.terminal.opened({key: terminalKey, ptyId, busy: model.busy})
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
  const grab = ctx.use(GrabApi)
  const pasteStagedGrabs = (): boolean => {
    const live = grab()
    if (live.status !== 'active' || model.status() !== 'open') return true
    const staged = live.value.staged()
    if (staged.length === 0) return true
    const block = staged.map((entry) => entry.text).join('\n\n')
    model.paste(model.terminal.modes.bracketedPasteMode ? block : block.replaceAll(/[\r\n]+/g, ' '))
    model.sendInput('\r')
    live.value.clear()
    return false
  }
  model.terminal.attachCustomKeyEventHandler((event) => {
    if (event.type === 'keydown' && event.key === 'Escape') event.preventDefault()
    if (!isPlainEnter(event)) return true
    if (pasteStagedGrabs()) return true
    event.preventDefault()
    return false
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
