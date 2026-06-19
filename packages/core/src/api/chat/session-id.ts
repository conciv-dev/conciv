import {HTTPError} from 'h3'
import {MANDARAX_SESSION_HEADER, isSessionId} from '@mandarax/protocol/chat-types'

// The session a request targets: our mandarax_ id from the MANDARAX_SESSION_HEADER, or null when absent (a
// not-yet-resolved request). Only our branded id is ever accepted — a header carrying anything else
// (e.g. a raw harness token) is a client error and throws 400. `resolve` is the sole route that
// takes a non-ours id, and it reads it from the body, never this header.
export function sessionIdFromHeaders(headers: Headers): string | null {
  const raw = headers.get(MANDARAX_SESSION_HEADER)?.trim()
  if (!raw) return null
  if (!isSessionId(raw)) throw new HTTPError({status: 400, message: 'invalid session id (must be ours)'})
  return raw
}
