import {toolDefinition} from '@conciv/extension/tool'
import {z} from 'zod'

const StartInput = z.object({})

const StopInput = z.object({captureId: z.string(), keyframes: z.number().int().min(0).max(8).default(3)})

const PullInput = z.object({
  secondsBack: z.number().int().positive().max(600).default(60),
  keyframes: z.number().int().min(0).max(8).default(3),
})

const RecordingImagePart = z.object({type: z.literal('image')}).loose()

const RecordingTextPart = z.object({type: z.literal('text'), content: z.string()}).loose()

const RecordingWindow = z.array(z.union([RecordingImagePart, RecordingTextPart]))

export const startToolDef = toolDefinition({
  name: 'recording_start',
  description:
    "Start a marked recording of the user's app page. Returns a captureId. Use before performing page actions you want to review, then call recording_stop.",
  inputSchema: StartInput,
  outputSchema: z.object({captureId: z.string(), startedAt: z.number()}),
  meta: {
    summary: 'start a marked recording of the app page',
    category: 'recorder',
    mutating: false,
    keywords: ['record', 'capture'],
    hint: 'stop it with recording_stop to get the action log',
  },
})

export const stopToolDef = toolDefinition({
  name: 'recording_stop',
  description:
    'Stop a marked recording and get back what happened: a semantic action log (clicks, inputs, navigations, errors) plus keyframe screenshots.',
  inputSchema: StopInput,
  outputSchema: z.union([z.object({error: z.string()}), RecordingWindow]),
  meta: {
    summary: 'stop a marked recording and return its action log with keyframes',
    category: 'recorder',
    mutating: false,
    keywords: ['record', 'stop', 'screenshots'],
    hint: 'an unknown captureId answers with an error field instead of a log',
  },
})

export const pullToolDef = toolDefinition({
  name: 'recording_pull',
  description:
    'Pull the last N seconds of the always-on page recording (flight recorder). Returns a semantic action log plus keyframe screenshots. Use when the user refers to something that just happened in their app, or after an error.',
  inputSchema: PullInput,
  outputSchema: RecordingWindow,
  meta: {
    summary: 'pull the last seconds of the always-on page recording',
    category: 'recorder',
    mutating: false,
    keywords: ['record', 'flight', 'replay'],
    hint: 'use when the user refers to something that just happened in their app',
  },
})
