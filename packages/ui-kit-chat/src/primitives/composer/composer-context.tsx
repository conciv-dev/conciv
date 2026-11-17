import {createContext, useContext, type Accessor} from 'solid-js'
import type {z} from 'zod'
import type {Attachment, AttachmentAdapter} from '../attachment/attachment-adapter.js'

type JsonValue = z.core.util.JSONType

export type ComposerItem = {key: string; value: JsonValue}

export type ComposerDraft = {draft: string; attachments: Attachment[]; quote: string | null; items: ComposerItem[]}

export type ComposerContextValue = {
  attachments: Accessor<Attachment[]>
  attachmentAdapter: Accessor<AttachmentAdapter | undefined>
  addAttachment: (file: File) => Promise<string | null>
  hasAttachment: (id: string) => boolean
  replaceAttachment: (id: string, file: File) => Promise<string | null>
  removeAttachment: (id: string) => Promise<void>
  sendingAttachments: Accessor<boolean>
  snapshotDraft: () => ComposerDraft
  restoreDraft: (draft: ComposerDraft) => void
  clearDraft: () => void
  quote: Accessor<string | null>
  setQuote: (value: string | null) => void
  items: Accessor<ComposerItem[]>
  staged: Accessor<number>
  addItem: (item: ComposerItem) => void
  removeItem: (key: string) => void
  updateItem: (key: string, value: JsonValue) => void
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
