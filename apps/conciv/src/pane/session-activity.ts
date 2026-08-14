import {createEffect, onCleanup} from 'solid-js'
import {useLiveSessions} from '../app/context.js'

export type SessionActivityDeps = {
  sessionId: string
  working: () => boolean
  invalidateSessions: () => void
  onStart: () => void
  onSettle: () => void
}

export function trackSessionActivity(deps: SessionActivityDeps): void {
  const liveSessions = useLiveSessions()
  createEffect<boolean>((was) => {
    const now = deps.working()
    if (now === was) return was
    liveSessions.setRunning(deps.sessionId, now)
    if (now) deps.onStart()
    if (!now) deps.onSettle()
    return now
  }, false)

  onCleanup(() => {
    const live = deps.working()
    liveSessions.setRunning(deps.sessionId, false)
    if (live) deps.invalidateSessions()
  })
}
