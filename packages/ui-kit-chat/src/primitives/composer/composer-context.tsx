import {createContext, useContext, type Accessor} from 'solid-js'
import type {Attachment, AttachmentAdapter} from '../attachment/attachment-adapter.js'

export type ComposerContextValue = {
  attachments: Accessor<Attachment[]>
  attachmentAdapter: Accessor<AttachmentAdapter | undefined>
  addAttachment: (file: File) => Promise<void>
  removeAttachment: (id: string) => Promise<void>
  sendingAttachments: Accessor<boolean>
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
