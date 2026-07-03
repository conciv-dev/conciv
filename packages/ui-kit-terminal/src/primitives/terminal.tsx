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
  let element: HTMLDivElement | undefined
  onMount(() => {
    if (!element) return
    injectCss(element.getRootNode())
    model.terminal.open(element)
    element.__concivTerminal = {buffer: () => translateBuffer(model.terminal)}
    model.connect()
    model.fit()
    const observer = new ResizeObserver(() => model.fit())
    observer.observe(element)
    onCleanup(() => {
      observer.disconnect()
      model.disconnect()
    })
  })
  return <div ref={element} class={props.class} data-terminal-screen />
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
