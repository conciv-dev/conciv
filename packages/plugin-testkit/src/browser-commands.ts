import type {TestLLM} from '@conciv/harness-testkit'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {PermissionReply, ReasoningEffort} from '@conciv/protocol/chat-types'
import type {UiAnswerValue} from '@conciv/protocol/ui-types'
import type {CreateEngineOptions, Engine, EngineAddress, EngineSetting, ToolFailure} from './engine.js'

export type EngineHandle = {id: string; sessionId: string; address: EngineAddress}

export type EngineCommands = {
  concivCreateEngine: (options: CreateEngineOptions, scope: 'test' | 'file') => Promise<EngineHandle>
  concivStopEngine: (engineId: string) => Promise<void>
  concivStopFileEngines: () => Promise<void>
  concivNewSession: (engineId: string, title?: string) => Promise<string>
  concivSetting: (engineId: string, setting: EngineSetting) => Promise<void>
  concivGate: (engineId: string) => Promise<string>
  concivGateStarted: (engineId: string, gateId: string) => Promise<void>
  concivGateRelease: (engineId: string, gateId: string) => Promise<void>
  concivSessions: (engineId: string) => ReturnType<Engine['sessions']>
  concivRequests: (engineId: string) => Promise<TestLLM.RecordedRequest[]>
  concivPush: (engineId: string, replies: readonly TestLLM.Response[]) => Promise<void>
  concivAlways: (engineId: string, reply: TestLLM.Response) => Promise<void>
  concivWait: (engineId: string, count: number) => Promise<void>
  concivReadFile: (engineId: string, path: string) => Promise<string>
  concivWriteFile: (engineId: string, path: string, text: string) => Promise<void>
  concivSend: (engineId: string, sessionId: string, text: string) => Promise<void>
  concivApprove: (engineId: string, sessionId: string, reply: PermissionReply) => Promise<void>
  concivStop: (engineId: string, sessionId: string) => Promise<void>
  concivMessages: (engineId: string, sessionId: string) => Promise<ChatMessage[]>
  concivRename: (engineId: string, sessionId: string, title: string) => Promise<void>
  concivCompact: (engineId: string, sessionId: string) => Promise<void>
  concivModel: (engineId: string, sessionId: string, model: string) => Promise<void>
  concivEffort: (engineId: string, sessionId: string, effort: ReasoningEffort | null) => Promise<void>
  concivRemove: (engineId: string, sessionId: string) => Promise<void>
  concivAnswer: (engineId: string, sessionId: string, value: UiAnswerValue) => Promise<void>
  concivSwitchHarness: (engineId: string, sessionId: string, harnessId: string, model?: string) => Promise<void>
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
