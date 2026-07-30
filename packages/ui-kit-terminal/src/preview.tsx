import {onCleanup, onMount, type JSX} from 'solid-js'
import {Terminal as Xterm} from '@xterm/xterm'
import {injectXtermCss} from './xterm-css.js'
import type {TerminalTheme} from './model.js'

const DEFAULT_COLS = 58
const DEFAULT_FONT_SIZE = 11.5
const MIN_ROWS = 3

function rowsFor(content: string, rows?: number): number {
  return rows ?? Math.max(content.split('\n').length, MIN_ROWS)
}

function silence(host: HTMLElement): void {
  for (const field of host.querySelectorAll('textarea')) {
    field.tabIndex = -1
    field.setAttribute('aria-hidden', 'true')
  }
}

export function TerminalPreview(props: {
  content: string
  cols?: number
  rows?: number
  fontSize?: number
  theme?: TerminalTheme
  class?: string
}): JSX.Element {
  let host: HTMLDivElement | undefined = undefined
  onMount(() => {
    const element = host
    if (!element) return
    const terminal = new Xterm({
      cols: props.cols ?? DEFAULT_COLS,
      rows: rowsFor(props.content, props.rows),
      convertEol: true,
      scrollback: 0,
      disableStdin: true,
      cursorBlink: false,
      cursorInactiveStyle: 'none',
      fontSize: props.fontSize ?? DEFAULT_FONT_SIZE,
      theme: props.theme,
    })
    injectXtermCss(element.getRootNode())
    terminal.open(element)
    terminal.write(props.content)
    silence(element)
    onCleanup(() => terminal.dispose())
  })
  return (
    <div
      ref={(node) => {
        host = node
      }}
      class={props.class}
      aria-hidden="true"
      data-terminal-preview
    />
  )
}
