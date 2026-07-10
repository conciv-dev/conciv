import {EventEmitter} from 'node:events'

export type Changes = {emitter: EventEmitter; notify: () => void}

export function makeChanges(): Changes {
  const emitter = new EventEmitter()
  emitter.setMaxListeners(0)
  const state = {queued: false}
  const notify = (): void => {
    if (state.queued) return
    state.queued = true
    queueMicrotask(() => {
      state.queued = false
      emitter.emit('change')
    })
  }
  return {emitter, notify}
}

export function nextChange(changes: Changes, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const settle = () => {
      changes.emitter.off('change', settle)
      signal.removeEventListener('abort', settle)
      resolve()
    }
    changes.emitter.once('change', settle)
    signal.addEventListener('abort', settle, {once: true})
  })
}

export type ChangeWaiter = {wait: () => Promise<void>; dispose: () => void}

export function makeChangeWaiter(changes: Changes, signal: AbortSignal): ChangeWaiter {
  const state: {dirty: boolean; resolve: (() => void) | null} = {dirty: false, resolve: null}
  const wake = (): void => {
    state.dirty = true
    state.resolve?.()
  }
  changes.emitter.on('change', wake)
  signal.addEventListener('abort', wake, {once: true})
  return {
    wait: async () => {
      if (!state.dirty && !signal.aborted) {
        await new Promise<void>((resolve) => {
          state.resolve = resolve
        })
      }
      state.resolve = null
      state.dirty = false
    },
    dispose: () => {
      changes.emitter.off('change', wake)
      signal.removeEventListener('abort', wake)
    },
  }
}
