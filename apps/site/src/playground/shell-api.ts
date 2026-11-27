import {z} from 'zod'
import type {PlaygroundScriptId} from './playground-scripts'
import type {PageEdit} from './script'

export type StartPlaygroundOptions = {
  readonly host: HTMLElement
  readonly script: PlaygroundScriptId
  readonly reducedMotion: boolean
  readonly editPage: (edit: PageEdit) => void
}

export type StartPlayground = (options: StartPlaygroundOptions) => () => void

const PLAYGROUND_SHELL_URL = '/playground-shell/start-playground.js'

const ShellModule = z.object({
  startPlayground: z.custom<StartPlayground>((value) => typeof value === 'function'),
})

export async function loadPlayground(): Promise<StartPlayground> {
  const loaded: unknown = await import(/* @vite-ignore */ new URL(PLAYGROUND_SHELL_URL, document.baseURI).href)
  return ShellModule.parse(loaded).startPlayground
}
