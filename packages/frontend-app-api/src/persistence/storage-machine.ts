const EVICTION_RETRY_BASE_MS = 5_000

const EVICTION_RETRY_MAX_MS = 60_000

export type LocalStorageState = {
  readonly eviction:
    | {readonly status: 'ready'}
    | {readonly status: 'cooldown'; readonly failures: number; readonly retryAt: number}
  readonly notice: 'none' | 'pending' | 'shown'
}

export type LocalStorageEvent =
  | {readonly type: 'write.failed'}
  | {readonly type: 'eviction.succeeded'}
  | {readonly type: 'eviction.failed'; readonly now: number}
  | {readonly type: 'notice.shown'}

export const INITIAL_LOCAL_STORAGE_STATE: LocalStorageState = Object.freeze({
  eviction: Object.freeze({status: 'ready'}),
  notice: 'none',
})

export function transitionLocalStorage(state: LocalStorageState, event: LocalStorageEvent): LocalStorageState {
  if (event.type === 'notice.shown') return state.notice === 'pending' ? {...state, notice: 'shown'} : state

  if (event.type === 'eviction.succeeded') {
    return state.eviction.status === 'ready' ? state : {...state, eviction: INITIAL_LOCAL_STORAGE_STATE.eviction}
  }

  const notice = state.notice === 'none' ? 'pending' : state.notice

  if (event.type === 'write.failed') return notice === state.notice ? state : {...state, notice}

  const failures = (state.eviction.status === 'cooldown' ? state.eviction.failures : 0) + 1

  return {eviction: {status: 'cooldown', failures, retryAt: event.now + evictionBackoff(failures)}, notice}
}

export function canEvict(state: LocalStorageState, now: number) {
  return state.eviction.status === 'ready' || now >= state.eviction.retryAt
}

export function isStorageNoticePending(state: LocalStorageState) {
  return state.notice === 'pending'
}

function evictionBackoff(failures: number) {
  return Math.min(EVICTION_RETRY_MAX_MS, EVICTION_RETRY_BASE_MS * 2 ** Math.min(failures - 1, 4))
}
