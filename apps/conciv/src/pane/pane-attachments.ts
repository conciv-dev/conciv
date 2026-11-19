import type {QueuedMessage} from '@conciv/ai/client'
import type {ContentPart} from '@conciv/protocol/chat-message-types'
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
import {guardPluginAttachmentCard} from '../runtime/plugin/plugin-boundary.js'
import type {DraftStore} from '../runtime/persistence/drafts.js'
import {keepDraftImage} from './draft-storage.js'

const IMAGE_ATTACHMENT_ADAPTER = createSimpleImageAttachmentAdapter()
const TEXT_ATTACHMENT_ADAPTER = createTextAttachmentAdapter()

function keptInDraftStore(drafts: DraftStore | null): AttachmentAdapter {
  if (!drafts) return IMAGE_ATTACHMENT_ADAPTER
  return {
    ...IMAGE_ATTACHMENT_ADAPTER,
    add: (state) => {
      const added = IMAGE_ATTACHMENT_ADAPTER.add(state)
      if (!(added instanceof Promise)) return added
      return added.then(async (pending) => {
        if (pending.status.type === 'incomplete') return pending
        const blob = await keepDraftImage(drafts, state.file)
        return blob ? {...pending, blob} : pending
      })
    },
  }
}

function attachmentCards(fallback: 'card' | 'chip'): AttachmentCardSlot[] {
  return pageAttachmentCards.map((card) => guardPluginAttachmentCard('page', fallback, card))
}

export function paneAttachments(
  imageInput: unknown,
  drafts: DraftStore | null,
): {cards: AttachmentCardSlot[]; chips: AttachmentCardSlot[]; adapter: AttachmentAdapter} {
  const cards = attachmentCards('card')
  const image = imageInput === 'native' || imageInput === 'fileRef' ? keptInDraftStore(drafts) : undefined
  const adapter = composeAttachmentAdapters([
    ...(image ? [image] : []),
    TEXT_ATTACHMENT_ADAPTER,
    ...cards.map((entry) => createDocumentAttachmentAdapter(entry.mime)),
  ])
  return {cards, chips: attachmentCards('chip'), adapter}
}

export type DraftSink = {insert: (text: string) => void; addFile: (file: File) => void}

export type QueueOwner = {queue: () => readonly QueuedMessage[]; cancelQueued: (id: string) => void}

function visibleParts(content: QueuedMessage['content']): ContentPart[] {
  const body = typeof content === 'string' ? content : content.content
  if (typeof body === 'string') return [{type: 'text', content: body}]
  return body.filter((part) => !partIsModelOnly(part))
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
  const parts = items.flatMap((item) => visibleParts(item.content))
  const text = parts.flatMap((part) => (part.type === 'text' ? [part.content] : []))
  if (text.length > 0) sink.insert(text.join('\n'))
  for (const file of parts.flatMap(partFile)) sink.addFile(file)
}
