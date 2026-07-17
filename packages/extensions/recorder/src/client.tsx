import {defineExtension} from '@conciv/extension'
import {RECORDER_NAME, recorderConfig} from './shared/protocol.js'

export default defineExtension({name: RECORDER_NAME, configSchema: recorderConfig})
