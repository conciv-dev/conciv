import {createContext, useContext} from 'solid-js'
import {INERT_TOOL_CATALOG, type ToolCardProps, type ToolViewCtx} from '@conciv/types/tool-view-types'

export const INERT_ADD_RESULT: ToolCardProps['addResult'] = () => Promise.resolve()

export const INERT_TOOL_CTX: ToolViewCtx = {
  catalog: INERT_TOOL_CATALOG,
  addResult: () => Promise.resolve(),
}

const ToolContext = createContext<ToolViewCtx>(INERT_TOOL_CTX)

export const ToolProvider = ToolContext.Provider

export function useToolCtx(): ToolViewCtx {
  return useContext(ToolContext)
}
