import {defineTool} from '@conciv/extension'
import {pullWindow, type RecorderRuntime} from '../server/runtime.js'
import {pullToolDef, startToolDef, stopToolDef} from './def.js'

type Ctx = {recorder: RecorderRuntime}

const START_ATTACH_TIMEOUT_MS = 5000

export const startTool = defineTool(startToolDef).server(async (_input, ctx: Ctx) => {
  const {captureId, startTs, appendCursor} = ctx.recorder.control.startCapture()
  const covered = await ctx.recorder.control.awaitAppendAfter(appendCursor, START_ATTACH_TIMEOUT_MS)
  if (covered) return {captureId, startedAt: startTs}
  ctx.recorder.control.stopCapture(captureId)
  return {error: 'no page client attached within 5s; the app page with the widget must be open to record'}
})

export const stopTool = defineTool(stopToolDef).server(async ({captureId, keyframes}, ctx: Ctx) => {
  const range = ctx.recorder.control.stopCapture(captureId)
  if (!range) return {error: `no active capture ${captureId}`}
  await ctx.recorder.control.awaitAppendAfter(range.appendCursor, 1500)
  return pullWindow(ctx.recorder, range.startTs, range.stopTs, keyframes)
})

export const pullTool = defineTool(pullToolDef).server(async ({secondsBack, keyframes}, ctx: Ctx) => {
  const toTs = Date.now()
  if (ctx.recorder.control.isLive()) {
    const appendCursor = ctx.recorder.control.emit({flush: true})
    await ctx.recorder.control.awaitAppendAfter(appendCursor, 1500)
  }
  return pullWindow(ctx.recorder, toTs - secondsBack * 1000, toTs, keyframes)
})
