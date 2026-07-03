import {createEffect, type JSX} from 'solid-js'
import {Terminal, createTerminalModel, type TerminalTheme} from '@conciv/ui-kit-terminal'
import type {SessionClient} from '@conciv/api-client'
import {ExtensionSurface, type ExtensionHostBag, type ExtensionInstance} from '../extension/extension-slots.js'

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32

function readTerminalTheme(element: Element): TerminalTheme {
  const tokens = getComputedStyle(element)
  const token = (name: string, fallback: string): string => tokens.getPropertyValue(name).trim() || fallback
  return {
    background: token('--pw-panel', '#101014'),
    foreground: token('--pw-text-hi', '#d6d6de'),
    cursor: token('--pw-text-hi', '#d6d6de'),
    selectionBackground: token('--pw-fill-strong', '#3a3a44'),
  }
}

export function TerminalView(props: {
  client: SessionClient
  instances: ExtensionInstance[]
  bag: ExtensionHostBag
  onBusyChange: (busy: boolean) => void
  onBackToChat: () => void
}): JSX.Element {
  let host: HTMLDivElement | undefined
  const model = createTerminalModel({
    url: () => props.client.ttyUrl(DEFAULT_COLS, DEFAULT_ROWS),
    theme: () => readTerminalTheme(host ?? document.body),
  })
  createEffect(() => props.onBusyChange(model.busy()))
  return (
    <div ref={host} class="flex flex-col flex-1 min-h-0 anim-msg">
      <ExtensionSurface name="terminal-header" instances={props.instances} bag={props.bag} />
      <Terminal model={model} onBackToChat={props.onBackToChat} class="flex-1 min-h-0" />
    </div>
  )
}
