import {EvlogError} from 'evlog'
import {aiErrors} from '@conciv/errors'

export function approvalDenied(name: string): EvlogError {
  return aiErrors.APPROVAL_DENIED({name})
}

export function isApprovalDenied(error: unknown): boolean {
  return EvlogError.isEvlogError(error) && error.code === aiErrors.APPROVAL_DENIED.code
}
