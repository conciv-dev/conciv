import {createContext, useContext, type Accessor} from 'solid-js'
import type {MultimodalContent} from '@tanstack/ai-client'

export type ComposerHandlers = {
  onSend?: (content: string | MultimodalContent) => void
  onCancel?: () => void
  onSteer?: () => void | Promise<unknown>
  onStartDictation?: () => void
  onStopDictation?: () => void
  transcript?: Accessor<string>
}

const ComposerHandlersContext = createContext<ComposerHandlers>({})

export const ComposerHandlersProvider = ComposerHandlersContext.Provider

export function useComposerHandlers(): ComposerHandlers {
  return useContext(ComposerHandlersContext)
}
