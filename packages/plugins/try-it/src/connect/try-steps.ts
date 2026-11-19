export type TryStep = 'copy' | 'run' | 'approve'
export type StepState = 'pending' | 'active' | 'done'

export function stepStates(opts: {copied: boolean; connected: boolean}): Record<TryStep, StepState> {
  if (opts.connected) return {copy: 'done', run: 'done', approve: 'done'}
  if (opts.copied) return {copy: 'done', run: 'active', approve: 'pending'}
  return {copy: 'active', run: 'pending', approve: 'pending'}
}
