import type {Context} from '@conciv/backend-plugin-api/effect/plugin'
import * as Tool from '@conciv/protocol/schema/tool'
import {Clock, Effect} from 'effect'
import type {EvlogError} from 'evlog'
import {z} from 'zod'
import {CaptureControl} from './capture-control.js'
import type {ClientRingsInterface} from './rings.js'
import type {RendererCacheInterface} from './renderer-cache.js'
import {RecordingStore} from './recordings.js'
import {MAX_SECONDS_BACK, pullWindow, renderRecording} from './runtime.js'
import {recorderErrors} from './errors/errors.js'

const options = {namespace: 'recording', codemode: true}

const START_WAIT_MS = 5000

const FLUSH_WAIT_MS = 1500

function toolFailure(error: EvlogError) {
  return Effect.fail(Tool.makeError({message: error.message, error, metadata: {code: error.code, fix: error.fix}}))
}

const Keyframes = z.number().int().min(0).max(8).default(3)

export const register = Effect.fn('RecorderTools.register')(function* (ctx: Pick<Context, 'tool'>) {
  const services = yield* Effect.context<ClientRingsInterface | RendererCacheInterface>()
  const control = yield* CaptureControl
  const recordings = yield* RecordingStore
  const pull = (fromTs: number, toTs: number, keyframes: number) =>
    pullWindow(fromTs, toTs, keyframes).pipe(Effect.provideContext(services))
  yield* ctx.tool.transform((editor) => {
    editor.namespace({
      name: 'recording',
      description:
        "Marked recordings of the user's app page: start one, act, stop it, or pull the last seconds. Each answers a semantic action log plus keyframe screenshots.",
    })
    editor.add({
      name: 'start',
      description:
        "Start a marked recording of the user's app page. Waits for the page to attach and begin streaming, then returns a captureId, so acting right after it returns is safe. Use before performing page actions you want to review, then call recording_stop.",
      input: z.object({}),
      output: z.object({captureId: z.string(), startedAt: z.number()}),
      options,
      execute: () =>
        Effect.gen(function* () {
          const {captureId, startTs, appendCursor} = yield* control.startCapture
          const covered = yield* control.awaitAppendAfter(appendCursor, START_WAIT_MS)
          if (covered) return {output: {captureId, startedAt: startTs}}
          yield* control.stopCapture(captureId).pipe(Effect.ignore)
          return yield* toolFailure(recorderErrors.NO_PAGE_CLIENT())
        }),
    })
    editor.add({
      name: 'stop',
      description:
        'Stop a marked recording and get back what happened: a semantic action log (clicks, inputs, navigations, errors) plus keyframe screenshots.',
      input: z.object({captureId: z.string(), keyframes: Keyframes}),
      output: z.string(),
      options,
      execute: ({captureId, keyframes}) =>
        Effect.gen(function* () {
          const range = yield* control.stopCapture(captureId)
          yield* control.awaitAppendAfter(range.appendCursor, FLUSH_WAIT_MS)
          return yield* pull(range.startTs, range.stopTs, keyframes)
        }).pipe(Effect.catch(toolFailure)),
    })
    editor.add({
      name: 'pull',
      description:
        'Pull the last N seconds of the on-demand page recording. Recording happens only while a requested recording is live, so data exists only during or after a recording_start; start one before acting. Returns a semantic action log plus keyframe screenshots.',
      input: z.object({
        secondsBack: z.number().int().positive().max(MAX_SECONDS_BACK).default(60),
        keyframes: Keyframes,
      }),
      output: z.string(),
      options,
      execute: ({secondsBack, keyframes}) =>
        Effect.gen(function* () {
          const toTs = yield* Clock.currentTimeMillis
          if (yield* control.isLive) {
            const appendCursor = yield* control.emit({flush: true})
            yield* control.awaitAppendAfter(appendCursor, FLUSH_WAIT_MS)
          }
          return yield* pull(toTs - secondsBack * 1000, toTs, keyframes)
        }),
    })
    editor.add({
      name: 'get',
      description:
        'Read a saved screen recording by its id. The user sends one as a screen recording note whose sentence names the id. Returns its semantic action log plus keyframe screenshots.',
      input: z.object({recordingId: z.string().min(1).max(256), keyframes: Keyframes}),
      output: z.string(),
      options,
      execute: ({recordingId, keyframes}) =>
        recordings.get(recordingId).pipe(
          Effect.flatMap((events) => renderRecording(events, keyframes).pipe(Effect.provideContext(services))),
          Effect.catch(toolFailure),
        ),
    })
  })
})
