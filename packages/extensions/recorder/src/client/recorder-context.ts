import {getExtensionApi} from '@conciv/extension'
import {RECORDER_NAME} from '../shared/protocol.js'
import type {RecorderStore} from './recorder-store.js'

declare module '@conciv/extension' {
  interface Register {
    recorder: {context: {store: RecorderStore}}
  }
}

export const useRecorderContext = getExtensionApi(RECORDER_NAME).useContext
