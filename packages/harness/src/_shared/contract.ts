import type {TextAdapter} from '@conciv/ai/server'
import type {ModelMessage} from '@conciv/protocol/chat-message-types'
import type {
  HarnessCapabilities,
  HarnessChatDeps,
  HarnessCommands,
  HarnessConnect,
  HarnessConnectContext,
  HarnessHistory,
  HarnessInit,
  HarnessModels,
} from '@conciv/protocol/harness-types'
import type {TtyCommand} from '@conciv/protocol/terminal-types'

export type HarnessChatConfig = {
  adapter: TextAdapter
  modelOptions?: Record<string, unknown>
  prepareMessages?: (messages: ModelMessage[]) => ModelMessage[]
}

type HarnessAdapterBase = {
  id: string
  binName: string

  displayName?: string

  connect?: HarnessConnect
  chatConfig: (deps: HarnessChatDeps) => HarnessChatConfig

  models?: HarnessModels
  defaultModel?: string

  tty?: {command(ctx: HarnessConnectContext): TtyCommand}
}

export type HarnessAdapter = HarnessAdapterBase &
  (
    | {capabilities: HarnessCapabilities & {transcriptHistory: true}; history: HarnessHistory}
    | {capabilities: HarnessCapabilities & {transcriptHistory: false}; history?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {slashCommands: 'live' | 'files'}; commands: HarnessCommands}
    | {capabilities: HarnessCapabilities & {slashCommands: 'none'}; commands?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {init: 'files'}; init: HarnessInit}
    | {capabilities: HarnessCapabilities & {init: 'none'}; init?: undefined}
  )

export function defineHarness<T extends HarnessAdapter>(adapter: T): T {
  return adapter
}
