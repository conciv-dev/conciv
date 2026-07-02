import {createContext, useContext} from 'solid-js'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'

const inert: ToolViewCtx = {apiBase: '', harnessId: '', sendMessage: () => {}}

const ToolContext = createContext<ToolViewCtx>(inert)

export const ToolProvider = ToolContext.Provider

export function useToolCtx(): ToolViewCtx {
  return useContext(ToolContext)
}
