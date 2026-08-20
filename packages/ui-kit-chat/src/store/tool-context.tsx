import {createContext, useContext} from 'solid-js'
import {INERT_TOOL_CATALOG, type ToolCardProps, type ToolViewCtx} from '@conciv/protocol/tool-view-types'

export const INERT_ADD_RESULT: ToolCardProps['addResult'] = () => {}

export const INERT_TOOL_CTX: ToolViewCtx = {
  apiBase: '',
  harnessId: '',
  sendMessage: () => {},
  catalog: INERT_TOOL_CATALOG,
  addResult: () => {},
  dismissUi: () => {},
}

const ToolContext = createContext<ToolViewCtx>(INERT_TOOL_CTX)

export const ToolProvider = ToolContext.Provider

export function useToolCtx(): ToolViewCtx {
  return useContext(ToolContext)
}
