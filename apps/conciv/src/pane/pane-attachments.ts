import type {AnyExtension} from '@conciv/extension'
import {
  composeAttachmentAdapters,
  createDocumentAttachmentAdapter,
  createSimpleImageAttachmentAdapter,
  createTextAttachmentAdapter,
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
