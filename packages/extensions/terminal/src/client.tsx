import {SquareTerminal} from 'lucide-solid'
import {defineExtension} from '@conciv/extension'
import {TERMINAL_NAME} from './shared/protocol.js'
import {TerminalPanelView} from './client/terminal-panel-view.js'

export const terminal = defineExtension({
  name: TERMINAL_NAME,
  views: [{id: 'terminal', label: 'Terminal', icon: SquareTerminal, Component: TerminalPanelView}],
})

export default terminal
