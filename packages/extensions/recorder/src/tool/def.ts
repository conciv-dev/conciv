import {z} from 'zod'

export const StartInput = z.object({})

export const StopInput = z.object({captureId: z.string(), keyframes: z.number().int().min(0).max(8).default(3)})

export const PullInput = z.object({
  secondsBack: z.number().int().positive().max(600).default(60),
  keyframes: z.number().int().min(0).max(8).default(3),
})

export const startToolDef = {
  name: 'recording_start',
  description:
    "Start a marked recording of the user's app page. Returns a captureId. Use before performing page actions you want to review, then call recording_stop.",
  inputSchema: StartInput,
}

export const stopToolDef = {
  name: 'recording_stop',
  description:
    'Stop a marked recording and get back what happened: a semantic action log (clicks, inputs, navigations, errors) plus keyframe screenshots.',
  inputSchema: StopInput,
}

export const pullToolDef = {
  name: 'recording_pull',
  description:
    'Pull the last N seconds of the always-on page recording (flight recorder). Returns a semantic action log plus keyframe screenshots. Use when the user refers to something that just happened in their app, or after an error.',
  inputSchema: PullInput,
}
