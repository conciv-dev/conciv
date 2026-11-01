import type {AnyToolBuilder} from '@conciv/extension'
import {captureDef, clearDef, diffDef, statusDef, targetDef, winnerDef} from '../shared/defs.js'
import type {DesignContext} from '../shared/types.js'
import {captureStep} from './steps/capture.js'
import {clearStep} from './steps/clear.js'
import {winnerStep} from './steps/winner.js'

export const SERVER_STEPS = [
  targetDef.server((input, ctx: DesignContext, request) => ctx.differ.register({input, session: request.sessionId})),
  diffDef.server((input, ctx: DesignContext, request) => ctx.differ.run({input, session: request.sessionId})),
  statusDef.server((_input, ctx: DesignContext, request) => ctx.differ.status({session: request.sessionId})),
  captureDef.server(captureStep),
  winnerDef.server(winnerStep),
  clearDef.server(clearStep),
] as const satisfies readonly AnyToolBuilder[]
