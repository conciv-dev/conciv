import type {QueuedMessage} from '@conciv/ai/client'
import type {ContentPart} from '@conciv/protocol/chat-message-types'
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
import {guardedAttachmentCards} from '../extension/extension-boundary.js'

const IMAGE_ATTACHMENT_ADAPTER = createSimpleImageAttachmentAdapter()
const TEXT_ATTACHMENT_ADAPTER = createTextAttachmentAdapter()

export function paneAttachments(
  extensions: AnyExtension[],
  imageInput: unknown,
): {cards: AttachmentCardSlot[]; chips: AttachmentCardSlot[]; adapter: AttachmentAdapter} {
  const cards = guardedAttachmentCards(extensions, 'card')
  const image = imageInput === 'native' || imageInput === 'fileRef' ? IMAGE_ATTACHMENT_ADAPTER : undefined
  const adapter = composeAttachmentAdapters([
    ...(image ? [image] : []),
    TEXT_ATTACHMENT_ADAPTER,
    ...cards.map((entry) => createDocumentAttachmentAdapter(entry.mime)),
  ])
  return {cards, chips: guardedAttachmentCards(extensions, 'chip'), adapter}
}

type DraftSink = {insert: (text: string) => void; addFile: (file: File) => void}

type QueueOwner = {queue: () => readonly QueuedMessage[]; cancelQueued: (id: string) => void}

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
  const parts = queued.flatMap((item) => visibleParts(item.content))
  const text = parts.flatMap((part) => (part.type === 'text' ? [part.content] : []))
  if (text.length > 0) sink.insert(text.join('\n'))
  for (const file of parts.flatMap(partFile)) sink.addFile(file)
}
