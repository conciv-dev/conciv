import {HTTPError} from 'h3'
import {CONCIV_SESSION_HEADER, isSessionId} from '@conciv/protocol/chat-types'

export function sessionIdFromHeaders(headers: Headers): string | null {
  const raw = headers.get(CONCIV_SESSION_HEADER)?.trim()
  if (!raw) return null
  if (!isSessionId(raw)) throw new HTTPError({status: 400, message: 'invalid session id (must be ours)'})
  return raw
}
