import {defineAttachment} from '@conciv/extension'
import type {RecorderRuntime} from '../server/runtime.js'
import {RECORDER_MIME} from './protocol.js'

export const recordingAttachment = defineAttachment<{recorder: RecorderRuntime}>({mime: RECORDER_MIME})
