import {createContext, useContext} from 'solid-js'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'

// Host-app seams the tool cards need (send a follow-up, answer an approval). The widget supplies the
// real ctx; headless/stories fall back to an inert default so cards still render.
const inert: ToolViewCtx = {apiBase: '', harnessId: '', sendMessage: () => {}}

const ToolContext = createContext<ToolViewCtx>(inert)

export const ToolProvider = ToolContext.Provider

export function useToolCtx(): ToolViewCtx {
  return useContext(ToolContext)
}
