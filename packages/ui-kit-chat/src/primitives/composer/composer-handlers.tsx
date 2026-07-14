import {createContext, useContext, type Accessor} from 'solid-js'
import type {MultimodalContent} from '@tanstack/ai-client'

export type ComposerHandlers = {
  onSend?: (content: string | MultimodalContent) => void
  onCancel?: () => void
  onStartDictation?: () => void
  onStopDictation?: () => void
  transcript?: Accessor<string>
  queue?: Accessor<Array<{id: string; text: string}>>
  steerQueued?: (id: string) => void
  removeQueued?: (id: string) => void
}

const ComposerHandlersContext = createContext<ComposerHandlers>({})

export const ComposerHandlersProvider = ComposerHandlersContext.Provider

export function useComposerHandlers(): ComposerHandlers {
  return useContext(ComposerHandlersContext)
}
