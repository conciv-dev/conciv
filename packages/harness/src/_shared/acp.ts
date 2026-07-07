import {acpCompatible} from '@tanstack/ai-acp'
import type {AcpPermissionOutcome, AcpPermissionRequest} from '@tanstack/ai-acp'
import type {HarnessChatConfig, HarnessChatDeps} from '@conciv/protocol/harness-types'

export function acpPermissionHandler(decide: HarnessChatDeps['decide']) {
  return async (request: AcpPermissionRequest): Promise<AcpPermissionOutcome> => {
    const title = request.toolCall.title ?? request.toolCall.toolCallId
    const decision = await decide(title, {toolCall: request.toolCall}, request.toolCall.toolCallId)
    const wanted = decision === 'allow' ? ['allow_once', 'allow_always'] : ['reject_once', 'reject_always']
    const option = request.options.find((candidate) => wanted.includes(candidate.kind))
    return option ? {outcome: 'selected', optionId: option.optionId} : {outcome: 'cancelled'}
  }
}

export function acpChatConfig(name: string, commandOf: (model: string) => string, defaultModel: string) {
  return (deps: HarnessChatDeps): HarnessChatConfig => ({
    adapter: acpCompatible({
      name,
      command: ({model}) => commandOf(model),
      permissions: 'interactive',
      onPermissionRequest: acpPermissionHandler(deps.decide),
    })(deps.model ?? defaultModel),
    modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
  })
}
