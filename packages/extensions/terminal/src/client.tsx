import type {JSX} from 'solid-js'
import {SquareTerminal} from 'lucide-solid'
import {defineExtension, getHostApi} from '@conciv/extension'
import {TERMINAL_NAME} from './shared/protocol.js'
import {TerminalPanelView} from './client/terminal-panel-view.js'
import {TerminalActions} from './client/terminal-actions.js'
import {TerminalPresencePill} from './client/presence-pill.js'
import {createTerminalStore} from './client/terminal-store.js'

function TerminalSlot(): JSX.Element {
  const slot = getHostApi().useSlot()
  if (slot !== 'status') return null
  return <TerminalPresencePill />
}

export const terminal = defineExtension({
  name: TERMINAL_NAME,
  Component: TerminalSlot,
  views: [
    {
      id: 'terminal',
      label: 'Terminal',
      icon: SquareTerminal,
      Component: TerminalPanelView,
      actions: TerminalActions,
    },
  ],
}).client(() => ({value: {store: createTerminalStore()}}))

export default terminal
