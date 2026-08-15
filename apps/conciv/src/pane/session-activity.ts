import {createEffect, onCleanup} from 'solid-js'
import {useLiveSessions} from '../app/context.js'

export type SessionActivityDeps = {
  working: () => boolean
  invalidateSessions: () => void
  onStart: () => void
  onSettle: () => void
}

export function trackSessionActivity(deps: SessionActivityDeps): void {
  useLiveSessions().register(() => deps.working())

  createEffect<boolean>((was) => {
    const now = deps.working()
    if (now === was) return was
    if (now) deps.onStart()
    if (!now) deps.onSettle()
    return now
  }, false)

  onCleanup(() => {
    if (!deps.working()) return
    deps.invalidateSessions()
  })
}
