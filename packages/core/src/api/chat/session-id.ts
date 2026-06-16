import {AIDX_SESSION_HEADER, DEFAULT_SESSION_ID} from '@aidx/protocol/chat-types'

// The session id a request targets: the AIDX_SESSION_HEADER value, or the default session.
export function sessionIdFromHeaders(headers: Headers): string {
  const raw = headers.get(AIDX_SESSION_HEADER)?.trim()
  return raw || DEFAULT_SESSION_ID
}
