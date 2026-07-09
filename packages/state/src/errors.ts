import {defineErrors, type ConcivError} from '@conciv/errors'

export type StateErrorCode =
  | 'unsupported-platform'
  | 'download-failed'
  | 'unpack-failed'
  | 'install-raced'
  | 'server-unhealthy'
  | 'records-request-failed'
  | 'record-not-found'

const scoped = defineErrors<StateErrorCode>({
  scope: 'state',
  userMessages: {
    'unsupported-platform': 'conciv does not support this platform yet',
    'download-failed': 'could not download the conciv state server',
    'unpack-failed': 'could not install the conciv state server',
    'install-raced': 'could not install the conciv state server',
    'server-unhealthy': 'the conciv state server failed to start',
    'records-request-failed': 'saving conciv state failed',
    'record-not-found': 'session not found',
  },
  httpStatus: {'record-not-found': 404, 'records-request-failed': 502},
})
export const stateError = scoped.error
export const isStateError = scoped.is
export type StateError = ConcivError<StateErrorCode>
