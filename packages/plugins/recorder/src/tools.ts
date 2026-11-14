import type {ToolDomain} from '@conciv/plugin'
import {z} from 'zod'
import {pullWindow, type RecorderRuntime} from './server/runtime.js'

const options = {namespace: 'recording', codemode: true}

const START_WAIT_MS = 5000

const FLUSH_WAIT_MS = 1500

const Keyframes = z.number().int().min(0).max(8).default(3)

const RecordingParts = z.array(
  z.union([
    z.object({type: z.literal('text'), text: z.string()}),
    z.object({type: z.literal('file'), uri: z.string(), mime: z.string()}),
  ]),
)

export function register(tool: ToolDomain, runtime: RecorderRuntime) {
  return tool.transform((editor) => {
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
      output: z.union([z.object({error: z.string()}), z.object({captureId: z.string(), startedAt: z.number()})]),
      options,
      execute: async () => {
        const {captureId, startTs, appendCursor} = runtime.control.startCapture()
        const covered = await runtime.control.awaitAppendAfter(appendCursor, START_WAIT_MS)
        if (covered) return {output: {captureId, startedAt: startTs}}
        runtime.control.stopCapture(captureId)
        return {
          output: {error: 'no page client attached within 5s; the app page with the widget must be open to record'},
        }
      },
    })
    editor.add({
      name: 'stop',
      description:
        'Stop a marked recording and get back what happened: a semantic action log (clicks, inputs, navigations, errors) plus keyframe screenshots.',
      input: z.object({captureId: z.string(), keyframes: Keyframes}),
      output: z.union([z.object({error: z.string()}), RecordingParts]),
      options,
      execute: async ({captureId, keyframes}) => {
        const range = runtime.control.stopCapture(captureId)
        if (!range) return {output: {error: `no active capture ${captureId}`}}
        await runtime.control.awaitAppendAfter(range.appendCursor, FLUSH_WAIT_MS)
        return {output: await pullWindow(runtime, range.startTs, range.stopTs, keyframes)}
      },
    })
    editor.add({
      name: 'pull',
      description:
        'Pull the last N seconds of the on-demand page recording. Recording happens only while a requested recording is live, so data exists only during or after a recording_start; start one before acting. Returns a semantic action log plus keyframe screenshots.',
      input: z.object({secondsBack: z.number().int().positive().max(600).default(60), keyframes: Keyframes}),
      output: RecordingParts,
      options,
      execute: async ({secondsBack, keyframes}) => {
        const toTs = Date.now()
        if (runtime.control.isLive()) {
          const appendCursor = runtime.control.emit({flush: true})
          await runtime.control.awaitAppendAfter(appendCursor, FLUSH_WAIT_MS)
        }
        return {output: await pullWindow(runtime, toTs - secondsBack * 1000, toTs, keyframes)}
      },
    })
  })
}
