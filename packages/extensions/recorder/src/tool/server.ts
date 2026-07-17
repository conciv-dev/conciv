import {defineTool} from '@conciv/extension'
import {pullWindow, type RecorderRuntime} from '../server/runtime.js'
import {PullInput, StartInput, StopInput, pullToolDef, startToolDef, stopToolDef} from './def.js'

type Ctx = {recorder: RecorderRuntime}

export const startTool = defineTool<typeof StartInput, Ctx>(startToolDef).server((_input, ctx) => {
  const {captureId, startTs} = ctx.recorder.control.startCapture()
  return {captureId, startedAt: startTs}
})

export const stopTool = defineTool<typeof StopInput, Ctx>(stopToolDef).server(async ({captureId, keyframes}, ctx) => {
  const range = ctx.recorder.control.stopCapture(captureId)
  if (!range) return {error: `no active capture ${captureId}`}
  await ctx.recorder.control.awaitNextAppend(1500)
  return pullWindow(ctx.recorder, range.startTs, range.stopTs, keyframes)
})

export const pullTool = defineTool<typeof PullInput, Ctx>(pullToolDef).server(async ({secondsBack, keyframes}, ctx) => {
  const toTs = Date.now()
  ctx.recorder.control.emit({flush: true})
  await ctx.recorder.control.awaitNextAppend(1500)
  return pullWindow(ctx.recorder, toTs - secondsBack * 1000, toTs, keyframes)
})
