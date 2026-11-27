import {onCleanup, onMount, untrack, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createTerminalModel, Terminal, type TerminalTheme} from '@conciv/ui-kit-terminal'
import {createKeyed, usePlugin, type MountedSession, type ServerRef} from '@conciv/frontend-plugin-api'
import {OPEN_FAILED, PANEL_KEY, type TerminalState} from './terminal-state.js'
import type {HeldPty} from './terminal-transport.js'

const ESCAPE_KEY = String.fromCharCode(27)

type TerminalSize = {readonly cols: number; readonly rows: number}

type PtyRequest = {readonly sessionId: string; readonly size: TerminalSize; readonly model: string | undefined}

function resolvedColor(element: Element, scheme: 'light' | 'dark', token: string): string | undefined {
  const probe = document.createElement('span')
  probe.style.colorScheme = scheme
  probe.style.color = `var(${token})`
  element.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color === '' ? undefined : color
}

function readTerminalTheme(element: Element, scheme: 'light' | 'dark'): TerminalTheme {
  const text = resolvedColor(element, scheme, '--chat-text-hi')
  return {
    background: resolvedColor(element, scheme, '--chat-bg'),
    foreground: text,
    cursor: text,
    selectionBackground: resolvedColor(element, scheme, '--chat-fill-strong'),
  }
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
  return node.tabIndex >= 0
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
    transport: untrack(() => props.terminal.transport(server.client.experimental.persistentPty, held)),
    beforeConnect: async (size) => {
      const request = {sessionId, size, model: untrack(() => props.terminal.spawnModel(sessionId))}
      const ptyId = await openPty(server, request).catch((cause: unknown) => {
        ctx.log.error({action: 'terminal', message: 'opening the session terminal failed', sessionId, error: cause})
        ctx.toast.show({title: OPEN_FAILED, variant: 'error'})
        props.terminal.fail(terminalKey, OPEN_FAILED)
        throw new Error(OPEN_FAILED, {cause})
      })
      if (held.ptyId !== ptyId) Object.assign(held, {ptyId, cursor: undefined})
      props.terminal.opened({key: terminalKey, ptyId, model: request.model, busy: model.busy})
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
  const terminal = untrack(() => props.terminal)
  const pasteHeldGrabs = (): boolean => {
    if (model.status() !== 'open' || terminal.held().length === 0) return true
    const block = terminal
      .takeHeld()
      .map((entry) => entry.text)
      .join('\n\n')
    model.paste(model.terminal.modes.bracketedPasteMode ? block : block.replaceAll(/[\r\n]+/g, ' '))
    model.sendInput('\r')
    return false
  }
  model.terminal.attachCustomKeyEventHandler((event) => {
    if (event.type === 'keydown' && event.key === 'Escape') event.preventDefault()
    if (!isPlainEnter(event)) return true
    if (pasteHeldGrabs()) return true
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
