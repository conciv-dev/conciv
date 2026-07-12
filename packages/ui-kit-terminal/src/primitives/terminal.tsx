import {createContext, onCleanup, onMount, Show, useContext, type JSX} from 'solid-js'
import xtermCss from '@xterm/xterm/css/xterm.css?inline'
import {translateBuffer, type TerminalModel} from '../model.js'

const TerminalContext = createContext<TerminalModel>()

export function useTerminal(): TerminalModel {
  const model = useContext(TerminalContext)
  if (!model) throw new Error('useTerminal outside <TerminalPrimitive.Root>')
  return model
}

type BufferReader = {buffer(): string}

declare global {
  interface HTMLDivElement {
    __concivTerminal?: BufferReader
  }
}

function Root(props: {model: TerminalModel; class?: string; children: JSX.Element}): JSX.Element {
  return (
    <TerminalContext.Provider value={props.model}>
      <div class={props.class} data-terminal-root data-status={props.model.status()}>
        {props.children}
      </div>
    </TerminalContext.Provider>
  )
}

function injectCss(root: Node): void {
  const target = root instanceof ShadowRoot ? root : document.head
  if (target.querySelector('style[data-conciv-xterm]')) return
  const style = document.createElement('style')
  style.setAttribute('data-conciv-xterm', '')
  style.textContent = xtermCss
  target.appendChild(style)
}

function Screen(props: {class?: string}): JSX.Element {
  const model = useTerminal()
  let element: HTMLDivElement | undefined = undefined
  onMount(() => {
    if (!element) return
    const screen = element
    injectCss(screen.getRootNode())
    model.terminal.open(screen)
    screen.__concivTerminal = {buffer: () => translateBuffer(model.terminal)}
    let started = false
    const start = (): void => {
      if (started || screen.clientWidth === 0) return
      started = true
      model.fit()
      model.connect()
      model.focus()
    }
    start()
    const observer = new ResizeObserver(() => (started ? model.fit() : start()))
    observer.observe(screen)
    onCleanup(() => {
      observer.disconnect()
      model.disconnect()
    })
  })
  return (
    <div
      ref={(node) => {
        element = node
      }}
      class={props.class}
      data-terminal-screen
    />
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

const OVERLAY_ANCHOR_STYLE: Record<'rail' | 'top-right', JSX.CSSProperties> = {
  rail: {display: 'flex', 'flex-direction': 'column', 'min-height': '0', 'min-width': '0', 'flex-shrink': '1'},
  'top-right': {position: 'absolute', top: '0.5rem', right: '0.5rem', 'z-index': '10'},
}

function Overlay(props: {anchor: 'rail' | 'top-right'; class?: string; children: JSX.Element}): JSX.Element {
  return (
    <div class={props.class} style={OVERLAY_ANCHOR_STYLE[props.anchor]} data-terminal-overlay={props.anchor}>
      {props.children}
    </div>
  )
}

export const TerminalPrimitive = {Root, Screen, Banner, Overlay}
