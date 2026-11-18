import type {QueuedMessage} from '@conciv/ai/client'
import type {ContentPart, NoteComment} from '@conciv/protocol/chat-message-types'
import type {DraftItem} from '@conciv/protocol/chat-types'
import type {AnyExtension} from '@conciv/extension'
import {
  composeAttachmentAdapters,
  createDocumentAttachmentAdapter,
  createSimpleImageAttachmentAdapter,
  createTextAttachmentAdapter,
  partIsModelOnly,
  type AttachmentAdapter,
  type AttachmentCardSlot,
} from '@conciv/ui-kit-chat'
import {pageAttachmentCards} from '@conciv/builtin-plugins/renderer'
import {guardedAttachmentCards} from '../extension/extension-boundary.js'
import {guardPluginAttachmentCard} from '../runtime/plugin/plugin-boundary.js'
import {commentContextItem, formatNoteComment, readPromptPresentation} from '../composer/comment-note.js'
import {noteItem} from '../composer/note-schema.js'

const IMAGE_ATTACHMENT_ADAPTER = createSimpleImageAttachmentAdapter()
const TEXT_ATTACHMENT_ADAPTER = createTextAttachmentAdapter()

function attachmentCards(extensions: AnyExtension[], fallback: 'card' | 'chip'): AttachmentCardSlot[] {
  const extensionCards = guardedAttachmentCards(extensions, fallback).filter(
    (entry) => !pageAttachmentCards.some((card) => card.mime === entry.mime),
  )
  return [...pageAttachmentCards.map((card) => guardPluginAttachmentCard('page', fallback, card)), ...extensionCards]
}

export function paneAttachments(
  extensions: AnyExtension[],
  imageInput: unknown,
): {cards: AttachmentCardSlot[]; chips: AttachmentCardSlot[]; adapter: AttachmentAdapter} {
  const cards = attachmentCards(extensions, 'card')
  const image = imageInput === 'native' || imageInput === 'fileRef' ? IMAGE_ATTACHMENT_ADAPTER : undefined
  const adapter = composeAttachmentAdapters([
    ...(image ? [image] : []),
    TEXT_ATTACHMENT_ADAPTER,
    ...cards.map((entry) => createDocumentAttachmentAdapter(entry.mime)),
  ])
  return {cards, chips: attachmentCards(extensions, 'chip'), adapter}
}

export type DraftSink = {
  insert: (text: string) => void
  addFile: (file: File) => void
  addItem: (item: DraftItem) => void
}

export type QueueOwner = {queue: () => readonly QueuedMessage[]; cancelQueued: (id: string) => void}

function queuedNotes(content: QueuedMessage['content']): NoteComment[] {
  return typeof content === 'string' ? [] : (readPromptPresentation(content.metadata)?.comments ?? [])
}

function visibleParts(content: QueuedMessage['content']): ContentPart[] {
  const body = typeof content === 'string' ? content : content.content
  if (typeof body === 'string') return [{type: 'text', content: body}]
  return body.filter((part) => !partIsModelOnly(part))
}

function typedParts(content: QueuedMessage['content']): ContentPart[] {
  const notes = queuedNotes(content)
  if (typeof content === 'string' || notes.length === 0) return visibleParts(content)
  const displayText = readPromptPresentation(content.metadata)?.displayText ?? ''
  if (typeof content.content === 'string') return displayText === '' ? [] : [{type: 'text', content: displayText}]
  return withoutAppendedSentences(visibleParts(content), notes.map(formatNoteComment).join('\n'))
}

function withoutAppendedSentences(parts: ContentPart[], sentences: string): ContentPart[] {
  const appended = parts.at(-1)
  if (appended?.type !== 'text' || appended.content !== sentences) return parts
  return parts.slice(0, -1)
}

function partFile(part: ContentPart): File[] {
  if (part.type === 'text' || part.source.type !== 'data') return []
  const bytes = Uint8Array.from(atob(part.source.value), (character) => character.charCodeAt(0))
  return [new File([bytes], part.type, {type: part.source.mimeType})]
}

export function returnQueueToDraft(owner: QueueOwner, sink: DraftSink): void {
  const queued = owner.queue()
  for (const item of queued) owner.cancelQueued(item.id)
  putBackInDraft(queued, sink)
}

export function putBackInDraft(items: readonly QueuedMessage[], sink: DraftSink): void {
  const parts = items.flatMap((item) => typedParts(item.content))
  const text = parts.flatMap((part) => (part.type === 'text' ? [part.content] : []))
  if (text.length > 0) sink.insert(text.join('\n'))
  for (const file of parts.flatMap(partFile)) sink.addFile(file)
  for (const note of items.flatMap((item) => queuedNotes(item.content)))
    sink.addItem(noteItem(commentContextItem(note)))
}
