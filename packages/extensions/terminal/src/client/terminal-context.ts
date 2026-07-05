import {getExtensionApi} from '@conciv/extension'
import {TERMINAL_NAME} from '../shared/protocol.js'
import type {TerminalStore} from './terminal-store.js'

declare module '@conciv/extension' {
  interface Register {
    terminal: {context: {store: TerminalStore}}
  }
}

export const useTerminalContext = getExtensionApi(TERMINAL_NAME).useContext
