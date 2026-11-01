import {tabCaptureDef, winnerDef} from '../shared/defs.js'
import {captureStep} from '../client/capture.js'
import {winnerStep} from '../client/winner.js'

export const CLIENT_TOOLS = [tabCaptureDef.client(captureStep), winnerDef.client(winnerStep)] as const
