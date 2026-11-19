import type {Context} from '@conciv/plugin/effect/plugin'
import {Tool} from '@conciv/plugin/schema/tool'
import {Effect} from 'effect'
import {z} from 'zod'
import {MAX_SECONDS_BACK, pullWindow, renderRecording, type RecorderRuntime} from './runtime.js'

const options = {namespace: 'recording', codemode: true}

const START_WAIT_MS = 5000

const FLUSH_WAIT_MS = 1500

const Keyframes = z.number().int().min(0).max(8).default(3)

function toolFailure(error: unknown): Tool.Error {
  if (error instanceof globalThis.Error && Tool.isToolError(error)) return error
  return Tool.makeError({message: error instanceof globalThis.Error ? error.message : String(error), error})
}

function attempt<Value>(work: () => Value) {
  return Effect.try({try: work, catch: toolFailure})
}

function attemptPromise<Value>(work: () => Promise<Value>) {
  return Effect.tryPromise({try: work, catch: toolFailure})
}

export const register = Effect.fn('RecorderTools.register')(function* (
  ctx: Pick<Context, 'tool'>,
  runtime: RecorderRuntime,
) {
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
          const {captureId, startTs, appendCursor} = yield* attempt(() => runtime.control.startCapture())
          const covered = yield* attemptPromise(() => runtime.control.awaitAppendAfter(appendCursor, START_WAIT_MS))
          if (covered) return {output: {captureId, startedAt: startTs}}
          yield* attempt(() => runtime.control.stopCapture(captureId))
          return yield* Effect.fail(
            Tool.makeError({
              message: 'no page client attached within 5s; the app page with the widget must be open to record',
            }),
          )
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
          const range = yield* attempt(() => runtime.control.stopCapture(captureId))
          if (!range) return yield* Effect.fail(Tool.makeError({message: `no active capture ${captureId}`}))
          yield* attemptPromise(() => runtime.control.awaitAppendAfter(range.appendCursor, FLUSH_WAIT_MS))
          return yield* attemptPromise(() => pullWindow(runtime, range.startTs, range.stopTs, keyframes))
        }),
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
          const toTs = Date.now()
          if (yield* attempt(() => runtime.control.isLive())) {
            const appendCursor = yield* attempt(() => runtime.control.emit({flush: true}))
            yield* attemptPromise(() => runtime.control.awaitAppendAfter(appendCursor, FLUSH_WAIT_MS))
          }
          return yield* attemptPromise(() => pullWindow(runtime, toTs - secondsBack * 1000, toTs, keyframes))
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
        Effect.gen(function* () {
          const recording = yield* attemptPromise(() => runtime.recordings.get(recordingId))
          if (recording.kind === 'expired')
            return yield* Effect.fail(Tool.makeError({message: `the recording ${recordingId} has expired`}))
          if (recording.kind === 'missing')
            return yield* Effect.fail(Tool.makeError({message: `there is no saved recording ${recordingId}`}))
          return yield* attemptPromise(() => renderRecording(runtime, recording.events, keyframes))
        }),
    })
  })
})
