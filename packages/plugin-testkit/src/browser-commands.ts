import type {TestLLM} from '@conciv/harness-testkit'
import type {CreateEngineOptions, Engine, EngineAddress, EngineSetting, ToolFailure} from './engine.js'

export type EngineHandle = {id: string; sessionId: string; address: EngineAddress; root: string}

export type EngineCommands = {
  concivCreateEngine: (options: CreateEngineOptions, scope: 'test' | 'file') => Promise<EngineHandle>
  concivStopEngine: (engineId: string) => Promise<void>
  concivStopFileEngines: () => Promise<void>
  concivNewSession: (engineId: string, title?: string) => Promise<string>
  concivSetting: (engineId: string, setting: EngineSetting) => Promise<void>
  concivGate: (engineId: string) => Promise<string>
  concivGateStarted: (engineId: string, gateId: string) => Promise<void>
  concivGateRelease: (engineId: string, gateId: string) => Promise<void>
  concivRequests: (engineId: string) => Promise<TestLLM.ModelRequest[]>
  concivEvent: (engineId: string, type: string) => Promise<string>
  concivEventArrived: (engineId: string, waitId: string) => Awaited<ReturnType<Engine['event']>>['arrived']
  concivRpcCall: (engineId: string, rpcId: string, method: string, input: unknown) => Promise<unknown>
  concivRpcFailure: (
    engineId: string,
    rpcId: string,
    method: string,
    input: unknown,
  ) => ReturnType<Engine['rpc']['failure']>
  concivOpened: (engineId: string) => ReturnType<Engine['opened']>
  concivSend: (engineId: string, sessionId: string, text: string) => Promise<void>
  concivApprove: (engineId: string, sessionId: string) => Promise<void>
  concivStop: (engineId: string, sessionId: string) => Promise<void>
  concivToolCall: (engineId: string, sessionId: string, name: string, input: unknown) => Promise<unknown>
  concivToolFailure: (engineId: string, sessionId: string, name: string, input: unknown) => Promise<ToolFailure>
}

export type PageCommands = {
  concivWatchPage: () => Promise<void>
  concivPageErrors: () => Promise<string[]>
}

declare module 'vitest/browser' {
  interface BrowserCommands extends EngineCommands, PageCommands {}
}

declare module 'vitest' {
  export interface ProvidedContext {
    concivPollTimeoutMs: number
  }
}
