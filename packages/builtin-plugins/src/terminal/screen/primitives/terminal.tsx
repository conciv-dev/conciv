import {createContext, onCleanup, onMount, Show, untrack, useContext, type JSX} from 'solid-js'
import type {TerminalModel} from '../model.js'
import xtermCss from '@xterm/xterm/css/xterm.css?inline'

function injectXtermCss(root: Node): void {
  const target = root instanceof ShadowRoot ? root : document.head
  if (target.querySelector('style[data-conciv-xterm]')) return
  const style = document.createElement('style')
  style.setAttribute('data-conciv-xterm', '')
  style.textContent = xtermCss
  target.appendChild(style)
}

const TerminalContext = createContext<TerminalModel>()

const ROOT_CLASS = 'w-full min-w-0'

function useTerminal(): TerminalModel {
  const model = useContext(TerminalContext)
  if (!model) throw new Error('useTerminal outside <TerminalPrimitive.Root>')
  return model
}

function Root(props: {model: TerminalModel; class?: string; children: JSX.Element}): JSX.Element {
  return (
    <TerminalContext.Provider value={untrack(() => props.model)}>
      <div class={`${ROOT_CLASS}  ${props.class ?? ''}`} data-terminal-root data-status={props.model.status()}>
        {props.children}
      </div>
    </TerminalContext.Provider>
  )
}

function focusedElement(root: Document | ShadowRoot): Element | null {
  const active = root.activeElement
  return active?.shadowRoot ? (focusedElement(active.shadowRoot) ?? active) : active
}

function focusStayedOnTheTab(screen: HTMLElement): boolean {
  const focused = focusedElement(screen.ownerDocument)
  if (focused === null || focused === screen.ownerDocument.body) return true
  const panel = screen.closest('[role="tabpanel"]') ?? screen
  return panel.contains(focused) || (panel.id !== '' && focused.getAttribute('aria-controls') === panel.id)
}

const SCREEN_FRAME_STYLE: JSX.CSSProperties = {display: 'flex'}
const SCREEN_HOST_STYLE: JSX.CSSProperties = {flex: '1 1 0', 'min-width': '0', 'min-height': '0'}

function Screen(props: {class?: string}): JSX.Element {
  const model = useTerminal()
  let element: HTMLDivElement | undefined = undefined
  onMount(() => {
    if (!element) return
    const screen = element
    model.terminal.open(screen)
    let started = false
    const start = (): void => {
      if (started || screen.clientWidth === 0 || screen.clientHeight === 0) return
      injectXtermCss(screen.getRootNode())
      model.fit()
      started = true
      model.connect()
      if (focusStayedOnTheTab(screen)) model.focus()
    }
    const measure = (): void => {
      if (model.status() === 'closed') return
      if (started) model.fit()
      else start()
    }
    start()
    const observer = new ResizeObserver(() => requestAnimationFrame(measure))
    observer.observe(screen)
    onCleanup(() => {
      observer.disconnect()
      model.disconnect()
    })
  })
  return (
    <div class={props.class} style={SCREEN_FRAME_STYLE} data-terminal-screen>
      <div
        ref={(node) => {
          element = node
        }}
        style={SCREEN_HOST_STYLE}
      />
    </div>
  )
}

function Banner(props: {children: (state: {code: number | null; message: string | null}) => JSX.Element}): JSX.Element {
  const model = useTerminal()
  return (
    <Show when={model.status() === 'exited' || model.status() === 'error'}>
      {props.children({code: model.exitCode(), message: model.errorMessage()})}
    </Show>
  )
}

export const TerminalPrimitive = {Root, Screen, Banner}
