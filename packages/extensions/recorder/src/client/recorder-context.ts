import {getExtensionApi} from '@conciv/extension'
import {RECORDER_NAME} from '../shared/protocol.js'

export const useRecorderContext = getExtensionApi(RECORDER_NAME).useContext
