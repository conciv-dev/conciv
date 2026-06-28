import {createContext, useContext, type Accessor} from 'solid-js'
import type {MessagePart} from '@tanstack/ai-client'

// A staged attachment = a tanstack non-text ContentPart queued for the next sendMessage. Composer
// owns this list (composer-local UI state, not chat data).
export type AttachmentPart = Extract<MessagePart, {type: 'image' | 'audio' | 'video' | 'document'}>
export type AttachmentDraft = {id: string; name: string; part: AttachmentPart}

export type ComposerContextValue = {
  attachments: Accessor<AttachmentDraft[]>
  addAttachment: (draft: AttachmentDraft) => void
  removeAttachment: (id: string) => void
  quote: Accessor<string | null>
  setQuote: (value: string | null) => void
  editing: Accessor<boolean>
  setEditing: (value: boolean) => void
  dictating: Accessor<boolean>
  setDictating: (value: boolean) => void
}

const ComposerContext = createContext<ComposerContextValue>()

export const ComposerProvider = ComposerContext.Provider

export function useComposerContext(): ComposerContextValue {
  const context = useContext(ComposerContext)
  if (!context) throw new Error('Composer.* must be used within a Composer.Root')
  return context
}
