import {acp} from '@conciv/ai/server'
import type {HarnessChatConfig, HarnessChatDeps} from '@conciv/protocol/harness-types'

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
