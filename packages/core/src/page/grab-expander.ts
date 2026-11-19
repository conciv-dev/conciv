import type {AttachmentDocumentPart, ContentPart} from '@conciv/protocol/chat-message-types'
import {GRAB_MIME, parseGrabPayload} from '@conciv/grab/grab-attachment'

async function expandGrab(part: AttachmentDocumentPart): Promise<readonly ContentPart[]> {
  const payload = parseGrabPayload(Buffer.from(part.source.value, 'base64').toString('utf8'))
  if (!payload || payload.text === '') return []
  return [{type: 'text', content: payload.text}]
}

export const grabExpander = {[GRAB_MIME]: expandGrab}
