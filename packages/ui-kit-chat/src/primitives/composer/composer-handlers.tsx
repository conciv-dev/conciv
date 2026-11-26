import {createContext, useContext, type Accessor} from 'solid-js'
import type {QueuedMessage, SendContent} from '@conciv/types/chat-message-types'
import type {ComposerDraft} from './composer-context.js'

export type ComposerHandlers = {
  onSend?: (content: string | SendContent, draft: ComposerDraft) => void | Promise<unknown>
  onSendError?: (error: unknown) => void
  onCancel?: () => void
  onSteer?: () => void | Promise<unknown>
  onSteerError?: (error: unknown, item: QueuedMessage) => void
  onStartDictation?: () => void
  onStopDictation?: () => void
  transcript?: Accessor<string>
}

const ComposerHandlersContext = createContext<ComposerHandlers>({})

export const ComposerHandlersProvider = ComposerHandlersContext.Provider

export function useComposerHandlers(): ComposerHandlers {
  return useContext(ComposerHandlersContext)
}

export function reportUnsent(error: unknown): void {
  console.error('[conciv] the message could not be sent', error)
}
