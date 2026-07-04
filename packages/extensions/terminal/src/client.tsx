import {SquareTerminal} from 'lucide-solid'
import {defineExtension} from '@conciv/extension'
import {TERMINAL_NAME} from './shared/protocol.js'
import {TerminalPanelView} from './client/terminal-panel-view.js'
import {TerminalActions} from './client/terminal-actions.js'
import {createTerminalStore} from './client/terminal-store.js'

export const terminal = defineExtension({
  name: TERMINAL_NAME,
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
