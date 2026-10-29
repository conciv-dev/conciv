import {createContext, useContext, type Accessor} from 'solid-js'
import type {SendContent} from '@conciv/ai/messages'

export type ComposerHandlers = {
  onSend?: (content: string | SendContent) => void | Promise<unknown>
  onSendError?: (error: unknown) => void
  onCancel?: () => void
  onSteer?: () => void | Promise<unknown>
  onSteerError?: (error: unknown) => void
  onStartDictation?: () => void
  onStopDictation?: () => void
  transcript?: Accessor<string>
}

const ComposerHandlersContext = createContext<ComposerHandlers>({})

export const ComposerHandlersProvider = ComposerHandlersContext.Provider

export function useComposerHandlers(): ComposerHandlers {
  return useContext(ComposerHandlersContext)
}
