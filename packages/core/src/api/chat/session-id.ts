import {AIDX_SESSION_HEADER, isSessionId} from '@aidx/protocol/chat-types'

// The session a request targets: our aidx_ id from the AIDX_SESSION_HEADER, or null when absent or
// malformed (a new, not-yet-resolved session). Only our branded id is ever accepted here.
export function sessionIdFromHeaders(headers: Headers): string | null {
  const raw = headers.get(AIDX_SESSION_HEADER)?.trim()
  if (!raw) return null
  return isSessionId(raw) ? raw : null
}
