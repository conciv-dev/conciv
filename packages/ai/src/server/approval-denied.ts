const DENIED_PREFIX = 'The user denied running tool "'
const DENIED_SUFFIX = '". Do not retry it; continue without it.'

export function approvalDenied(name: string): Error {
  return new Error(`${DENIED_PREFIX}${name}${DENIED_SUFFIX}`)
}

export function isApprovalDeniedMessage(message: string): boolean {
  return message.startsWith(DENIED_PREFIX) && message.endsWith(DENIED_SUFFIX)
}
