import {acp} from '@conciv/ai/server'
import type {HarnessChatDeps} from '@conciv/protocol/harness-types'
import type {HarnessChatConfig} from './contract.js'

export function acpChatConfig(name: string, commandOf: (model: string) => string, defaultModel: string) {
  return (deps: HarnessChatDeps): HarnessChatConfig => ({
    adapter: acp(deps.model ?? defaultModel, {
      name,
      command: ({model}) => commandOf(model),
      permissions: 'interactive',
    }),
    modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
  })
}
