import type {PlaygroundScriptId} from './playground-scripts'
import type {PageEdit} from './script'

export type StartPlaygroundOptions = {
  readonly host: HTMLElement
  readonly script: PlaygroundScriptId
  readonly reducedMotion: boolean
  readonly editPage: (edit: PageEdit) => void
}

export type StartPlayground = (options: StartPlaygroundOptions) => () => void

export const PLAYGROUND_SHELL_URL = '/playground-shell/start-playground.js'
