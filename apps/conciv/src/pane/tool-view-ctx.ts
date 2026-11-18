import type {ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {ToolCaptureView} from '@conciv/protocol/element-capture-types'
import type {PermissionScope} from '@conciv/protocol/chat-types'

export type ToolViewCtxDeps = {
  catalog: ToolCatalogView
  decide: (approvalId: string, approved: boolean, scope: PermissionScope) => Promise<void>
  onError: (error: unknown) => void
  addResult: ToolViewCtx['addResult']
  durationFor: NonNullable<ToolViewCtx['durationFor']>
  captureFor: (toolCallId: string) => ToolCaptureView | undefined
}

export function makeToolViewCtx(deps: ToolViewCtxDeps): ToolViewCtx {
  return {
    catalog: deps.catalog,
    addResult: deps.addResult,
    respondApproval: (approvalId, approved, scope) => {
      void deps.decide(approvalId, approved, scope).catch(deps.onError)
    },
    durationFor: deps.durationFor,
    captureFor: deps.captureFor,
  }
}
