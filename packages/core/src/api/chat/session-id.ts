import {AIDX_SESSION_HEADER, DEFAULT_SESSION_ID, SessionId} from '@aidx/protocol/chat-types'

// The session id a request targets: the AIDX_SESSION_HEADER value (charset-validated so it can
// never become a path-traversal token), or the default session when absent/blank/malformed.
export function sessionIdFromHeaders(headers: Headers): string {
  const raw = headers.get(AIDX_SESSION_HEADER)?.trim()
  if (!raw) return DEFAULT_SESSION_ID
  return SessionId.safeParse(raw).success ? raw : DEFAULT_SESSION_ID
}
