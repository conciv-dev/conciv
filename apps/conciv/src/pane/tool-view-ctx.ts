import type {ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {PermissionScope} from '@conciv/protocol/chat-types'

export type ToolViewCtxDeps = {
  catalog: ToolCatalogView
  decide: (approvalId: string, approved: boolean, scope: PermissionScope) => Promise<void>
  onError: (error: unknown) => void
  addResult: ToolViewCtx['addResult']
}

export function makeToolViewCtx(deps: ToolViewCtxDeps): ToolViewCtx {
  return {
    catalog: deps.catalog,
    addResult: deps.addResult,
    respondApproval: (approvalId, approved, scope) => {
      void deps.decide(approvalId, approved, scope).catch(deps.onError)
    },
  }
}
