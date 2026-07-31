function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function errorMessageFor(error: unknown, code: string): string | null {
  const seen = new Set<unknown>()
  let candidate: unknown = error
  while (isRecord(candidate) && !seen.has(candidate)) {
    seen.add(candidate)
    if (candidate.code === code) {
      const message = candidate.message
      return typeof message === 'string' && message.length > 0 ? message : ''
    }
    candidate = candidate.cause
  }
  return null
}

function messageOr(error: unknown, code: string, fallback: string): string | null {
  const message = errorMessageFor(error, code)
  if (message === null) return null
  return message.length > 0 ? message : fallback
}

export function sendConfirmMessage(error: unknown): string | null {
  return messageOr(error, 'EXTERNAL_CONFIRM', 'Claude is open in your terminal.')
}

export function sendBlockedMessage(error: unknown): string | null {
  return messageOr(error, 'EXTERNAL_BLOCKED', 'Claude is working in your terminal right now.')
}

export function sessionAttachedMessage(error: unknown): string | null {
  return messageOr(error, 'SESSION_ATTACHED', 'This session is driven from your terminal.')
}
