import {createContext, useContext, type Accessor} from 'solid-js'
import type {Attachment, AttachmentAdapter} from '../attachment/attachment-adapter.js'

export type ComposerDraft = {draft: string; attachments: Attachment[]; quote: string | null; grabs: string[]}

export type ComposerContextValue = {
  attachments: Accessor<Attachment[]>
  attachmentAdapter: Accessor<AttachmentAdapter | undefined>
  addAttachment: (file: File) => Promise<void>
  removeAttachment: (id: string) => Promise<void>
  sendingAttachments: Accessor<boolean>
  snapshotDraft: () => ComposerDraft
  restoreDraft: (draft: ComposerDraft) => void
  clearDraft: () => void
  quote: Accessor<string | null>
  setQuote: (value: string | null) => void
  grabs: Accessor<string[]>
  setGrabs: (values: string[]) => void
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
