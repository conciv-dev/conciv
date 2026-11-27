import {z} from 'zod'
import type {PlaygroundScriptId} from './playground-scripts'
import type {PageEdit, PlaygroundProgress} from './script'

export type StartPlaygroundOptions = {
  readonly host: HTMLElement
  readonly script: PlaygroundScriptId
  readonly reducedMotion: boolean
  readonly editPage: (edit: PageEdit) => void
  readonly onProgress?: (progress: PlaygroundProgress) => void
}

export type Playback = {
  readonly stop: () => void
  readonly hold: () => void
  readonly resume: () => void
}

export type StartPlayground = (options: StartPlaygroundOptions) => Playback

export const PLAYGROUND_HOST_CLASS = 'pointer-events-none fixed inset-0 z-2147483000'

const PLAYGROUND_SHELL_URL = '/playground-shell/start-playground.js'

const PLAYGROUND_SOURCE = 'conciv-playground'

export const PlaygroundCommand = z.object({
  source: z.literal(PLAYGROUND_SOURCE),
  command: z.enum(['hold', 'resume']),
})

export const PlaygroundReport = z.object({
  source: z.literal(PLAYGROUND_SOURCE),
  progress: z.object({turn: z.number(), turns: z.number(), ended: z.boolean()}),
})

export function playgroundCommand(
  command: z.infer<typeof PlaygroundCommand>['command'],
): z.infer<typeof PlaygroundCommand> {
  return {source: PLAYGROUND_SOURCE, command}
}

export function playgroundReport(progress: PlaygroundProgress): z.infer<typeof PlaygroundReport> {
  return {source: PLAYGROUND_SOURCE, progress}
}

const ShellModule = z.object({
  startPlayground: z.custom<StartPlayground>((value) => typeof value === 'function'),
})

async function loadPlayground(): Promise<StartPlayground> {
  const loaded: unknown = await import(/* @vite-ignore */ new URL(PLAYGROUND_SHELL_URL, document.baseURI).href)
  return ShellModule.parse(loaded).startPlayground
}

export type MountPlaygroundOptions = Omit<StartPlaygroundOptions, 'reducedMotion'> & {
  readonly onFailure: (error: unknown) => void
}

export type MountedPlayground = {
  readonly playback: () => Playback | undefined
  readonly stop: () => void
}

export function mountPlayground({onFailure, ...options}: MountPlaygroundOptions): MountedPlayground {
  const state: {closed: boolean; playback: Playback | undefined} = {closed: false, playback: undefined}
  loadPlayground()
    .then((startPlayground) => {
      if (state.closed) return
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
      state.playback = startPlayground({...options, reducedMotion})
    })
    .catch((error: unknown) => {
      if (!state.closed) onFailure(error)
    })
  return {
    playback: () => state.playback,
    stop: () => {
      state.closed = true
      state.playback?.stop()
    },
  }
}
