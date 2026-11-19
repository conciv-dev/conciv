import type {ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {PermissionReply} from '@conciv/protocol/chat-types'

export type ToolViewCtxDeps = {
  catalog: ToolCatalogView
  decide: (approvalId: string, reply: PermissionReply) => Promise<void>
  onError: (error: unknown) => void
  addResult: ToolViewCtx['addResult']
}

export function makeToolViewCtx(deps: ToolViewCtxDeps): ToolViewCtx {
  return {
    catalog: deps.catalog,
    addResult: deps.addResult,
    respondApproval: (approvalId, reply) => {
      void deps.decide(approvalId, reply).catch(deps.onError)
    },
  }
}
