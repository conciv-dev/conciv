export type UserCode =
  | 'state.unsupported-platform'
  | 'state.download-failed'
  | 'state.unpack-failed'
  | 'state.install-raced'
  | 'state.server-unhealthy'
  | 'state.records-request-failed'
  | 'state.record-not-found'
  | 'state.missing-provider'
  | 'core.internal'

export const USER_MESSAGES: Record<UserCode, string> = {
  'state.unsupported-platform': 'conciv does not support this platform yet',
  'state.download-failed': 'could not download the conciv state server',
  'state.unpack-failed': 'could not install the conciv state server',
  'state.install-raced': 'could not install the conciv state server',
  'state.server-unhealthy': 'the conciv state server failed to start',
  'state.records-request-failed': 'saving conciv state failed',
  'state.record-not-found': 'session not found',
  'state.missing-provider': 'conciv state is not available in this view',
  'core.internal': 'something went wrong',
}
