import type {z} from 'zod'
import type {EventEnvelopeSchema} from '@conciv/contract'
import type {PluginEngine} from './plugin-engine.js'

export type EngineEvent = z.output<typeof EventEnvelopeSchema>

export type EngineFailure = {readonly type: string; readonly message: string; readonly data?: unknown}

export type EngineOutcome = {ok: true; value: unknown} | {ok: false; failure: EngineFailure}

export type EngineStartOptions = Pick<PluginEngine.Options, 'plugins' | 'permissions' | 'policies'>

export type EngineCommands = {
  concivPluginEngineStart: (options: EngineStartOptions) => Promise<{id: string; sessionId: string}>
  concivPluginEngineStop: (engineId: string) => Promise<void>
  concivPluginEngineCall: (engineId: string, rpcId: string, method: string, input: unknown) => Promise<EngineOutcome>
  concivPluginEngineTool: (
    engineId: string,
    sessionId: string,
    name: string,
    input: unknown,
  ) => Promise<PluginEngine.ToolAnswer>
  concivPluginEngineToolFailure: (
    engineId: string,
    sessionId: string,
    name: string,
    input: unknown,
  ) => Promise<PluginEngine.ToolFailure>
  concivPluginEngineWrite: (engineId: string, path: string, content: string) => Promise<string>
  concivPluginEngineEventsOpen: (engineId: string) => Promise<string>
  concivPluginEngineEventsNext: (engineId: string, feedId: string) => Promise<EngineEvent | undefined>
  concivPluginEngineEventsClose: (engineId: string, feedId: string) => Promise<void>
}

export type PageCommands = {
  concivWatchPage: () => Promise<void>
  concivPageErrors: () => Promise<string[]>
}

declare module 'vitest/browser' {
  interface BrowserCommands extends PageCommands, EngineCommands {}
}

declare module 'vitest' {
  export interface ProvidedContext {
    concivPollTimeoutMs: number
    concivViewport: {width: number; height: number}
    concivTestPlugins: {name: string; id: string; kind: 'engine' | 'host'}[]
  }
}
