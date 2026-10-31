import type {AnyToolBuilder} from '@conciv/extension'
import {captureDef, clearDef, diffDef, statusDef, targetDef, winnerDef} from '../shared/defs.js'
import {captureStep} from './steps/capture.js'
import {clearStep} from './steps/clear.js'
import {diffStep} from './steps/diff.js'
import {statusStep} from './steps/status.js'
import {targetStep} from './steps/target.js'
import {winnerStep} from './steps/winner.js'

export const SERVER_STEPS = [
  targetDef.server(targetStep),
  diffDef.server(diffStep),
  statusDef.server(statusStep),
  captureDef.server(captureStep),
  winnerDef.server(winnerStep),
  clearDef.server(clearStep),
] as const satisfies readonly AnyToolBuilder[]
