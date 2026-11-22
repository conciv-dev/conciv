import type {Outside, OutsideAgent, OutsideReply, TestLLM} from '@conciv/harness-testkit'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import type {Engine, EngineAddress, EngineSetting, EngineStart, ToolFailure} from './engine.js'

export type EngineHandle = {id: string; sessionId: string; address: EngineAddress; root: string; home: string}

export type EngineCommands = {
  concivCreateEngine: (config: ConcivConfig, options: EngineStart, scope: 'test' | 'file') => Promise<EngineHandle>
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
  concivLoginCode: (engineId: string) => Promise<string>
  concivRevokeBrowsers: (engineId: string) => Promise<void>
  concivRestart: (engineId: string) => Promise<void>
  concivClockTick: (engineId: string) => Promise<void>
  concivClockDrain: (engineId: string) => Promise<void>
  concivOpened: (engineId: string) => ReturnType<Engine['opened']>
  concivSend: (engineId: string, sessionId: string, text: string) => Promise<void>
  concivApprove: (engineId: string, sessionId: string) => Promise<void>
  concivStop: (engineId: string, sessionId: string) => Promise<void>
  concivToolCall: (engineId: string, sessionId: string, name: string, input: unknown) => Promise<unknown>
  concivToolFailure: (engineId: string, sessionId: string, name: string, input: unknown) => Promise<ToolFailure>
  concivOutsideDescribe: (engineId: string, agent: OutsideAgent) => ReturnType<Outside['describe']>
  concivOutsideDiscover: (engineId: string, agent: OutsideAgent, toolNames: string[]) => Promise<OutsideReply>
  concivOutsideCall: (engineId: string, agent: OutsideAgent, name: string, input: unknown) => Promise<OutsideReply>
  concivReply: (engineId: string, replies: (TestLLM.Reply | 'hang')[]) => Promise<void>
  concivStale: (engineId: string, staleness: Parameters<Engine['stale']>[0]) => Promise<void>
  concivVersion: (engineId: string, version: string) => Promise<void>
  concivWrite: (engineId: string, path: string, content: string) => Promise<void>
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
    concivViewport: {width: number; height: number}
    concivTestPlugins: {name: string; id: string; kind: 'engine' | 'host'}[]
  }
}
