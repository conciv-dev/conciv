import {defineChatMiddleware} from '@tanstack/ai'
import {provideSandbox, provideSandboxPolicy, SandboxCapability, type SandboxDefinition} from '@tanstack/ai-sandbox'

export function withConcivSandbox(definition: SandboxDefinition) {
  return defineChatMiddleware({
    name: 'conciv-sandbox',
    provides: [SandboxCapability],
    async setup(ctx) {
      const handle = await definition.ensure({threadId: ctx.threadId, runId: ctx.runId, signal: ctx.signal})
      provideSandbox(ctx, handle)
      if (definition.policy) provideSandboxPolicy(ctx, definition.policy)
    },
  })
}
