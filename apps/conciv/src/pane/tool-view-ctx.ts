import type {ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {RpcClient} from '@conciv/contract'
import type {ToolCaptureView} from '@conciv/protocol/element-capture-types'

export type ToolViewCtxDeps = {
  rpc: RpcClient
  harnessId: () => string
  catalog: ToolCatalogView
  sendMessage: (text: string) => void
  addResult: ToolViewCtx['addResult']
  dismissUi: ToolViewCtx['dismissUi']
  durationFor: (toolCallId: string) => number | undefined
  captureFor: (toolCallId: string) => ToolCaptureView | undefined
}

export function makeToolViewCtx(deps: ToolViewCtxDeps): ToolViewCtx {
  return {
    apiBase: '',
    harnessId: deps.harnessId(),
    sendMessage: deps.sendMessage,
    catalog: deps.catalog,
    addResult: deps.addResult,
    dismissUi: deps.dismissUi,
    respondApproval: (approvalId, approved) => {
      void deps.rpc.chat.permissionDecision({approvalId, approved}).catch(() => {})
    },
    durationFor: deps.durationFor,
    captureFor: deps.captureFor,
  }
}
