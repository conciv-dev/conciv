import {parseGrabPayload} from '@conciv/grab/grab-attachment'
import {grabAttachment} from '../shared/grab-attachment.js'

function decodeBody(value: string): string | null {
  try {
    return Buffer.from(value, 'base64').toString('utf8')
  } catch {
    return null
  }
}

grabAttachment.server(async (part) => {
  const body = decodeBody(part.source.value)
  const payload = body === null ? null : parseGrabPayload(body)
  if (!payload || payload.text === '') return []
  return [{type: 'text', content: payload.text}]
})

export {grabAttachment}
