import type {TextAdapter} from '../adapters/adapters.js'
import type {ModelMessage} from '@conciv/types/chat-message-types'
import type {
  HarnessCapabilities,
  HarnessChatDeps,
  HarnessCommands,
  HarnessConnectContext,
  HarnessHistory,
  HarnessInit,
  HarnessLogin,
  HarnessModels,
  HarnessResume,
} from '@conciv/types/harness-types'
import type {TtyCommand} from '@conciv/types/terminal-types'

export type HarnessChatConfig = {
  adapter: TextAdapter
  modelOptions?: Record<string, unknown>
  prepareMessages?: (messages: ModelMessage[]) => Promise<ModelMessage[]>
}

type HarnessAdapterBase = {
  id: string
  binName: string

  displayName?: string

  chatConfig: (deps: HarnessChatDeps) => Promise<HarnessChatConfig>

  models?: HarnessModels
  defaultModel?: () => Promise<string>

  tty?: {command(ctx: HarnessConnectContext): TtyCommand}
}

export type HarnessAdapter = HarnessAdapterBase &
  (
    | {capabilities: HarnessCapabilities & {transcriptHistory: true}; history: HarnessHistory; resume: HarnessResume}
    | {capabilities: HarnessCapabilities & {transcriptHistory: false}; history?: undefined; resume?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {slashCommands: 'live' | 'files'}; commands: HarnessCommands}
    | {capabilities: HarnessCapabilities & {slashCommands: 'none'}; commands?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {init: 'files'}; init: HarnessInit}
    | {capabilities: HarnessCapabilities & {init: 'none'}; init?: undefined}
  ) &
  (
    | {capabilities: HarnessCapabilities & {login: 'probe'}; login: HarnessLogin}
    | {capabilities: HarnessCapabilities & {login: 'none'}; login?: undefined}
  )

export function defineHarness<T extends HarnessAdapter>(adapter: T): T {
  return adapter
}
