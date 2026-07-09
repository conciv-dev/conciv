import {isConcivError, makeError, type ConcivError, type UserCode, type UserDetails} from '@conciv/errors'

export type StateErrorCode =
  | 'unsupported-platform'
  | 'download-failed'
  | 'checksum-mismatch'
  | 'unpack-failed'
  | 'install-raced'
  | 'server-unhealthy'
  | 'records-request-failed'
  | 'record-not-found'
  | 'missing-provider'
  | 'invalid-table'

const USER_CODES: Record<StateErrorCode, UserCode> = {
  'unsupported-platform': 'state.unsupported-platform',
  'download-failed': 'state.download-failed',
  'checksum-mismatch': 'state.checksum-mismatch',
  'unpack-failed': 'state.unpack-failed',
  'install-raced': 'state.install-raced',
  'server-unhealthy': 'state.server-unhealthy',
  'records-request-failed': 'state.records-request-failed',
  'record-not-found': 'state.record-not-found',
  'missing-provider': 'state.missing-provider',
  'invalid-table': 'state.invalid-table',
}

const STATUS_CODES: Partial<Record<StateErrorCode, number>> = {
  'record-not-found': 404,
  'records-request-failed': 502,
}

const CATEGORIES: Partial<Record<StateErrorCode, 'user' | 'internal'>> = {
  'record-not-found': 'user',
}

export type StateError = ConcivError

export function stateError(code: StateErrorCode, message: string, details: UserDetails = {}): StateError {
  return makeError({
    message,
    code,
    userCode: USER_CODES[code],
    category: CATEGORIES[code] ?? 'internal',
    statusCode: STATUS_CODES[code],
    details,
  })
}

export function isStateError(error: unknown): error is StateError {
  return isConcivError(error) && error.userCode.startsWith('state.')
}
