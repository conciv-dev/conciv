const APPROVAL_DENIED = 'approval-denied'

export function approvalDenied(name: string): Error {
  return new Error(`The user denied running tool "${name}". Do not retry it; continue without it.`, {
    cause: APPROVAL_DENIED,
  })
}

export function isApprovalDenied(error: unknown): boolean {
  return error instanceof Error && error.cause === APPROVAL_DENIED
}
