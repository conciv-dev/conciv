import {getExtensionApi} from '@conciv/extension'
import {TERMINAL_NAME} from '../shared/protocol.js'

export const useTerminalContext = getExtensionApi(TERMINAL_NAME).useContext
