import {createEffect, onCleanup} from 'solid-js'
import type {LiveSessions} from '../app/live-sessions.js'

export type SessionActivityDeps = {
  sessionId: string
  active: () => boolean
  liveSessions: LiveSessions
  invalidateSessions: () => void
  onSettle: () => void
}

export function trackSessionActivity(deps: SessionActivityDeps): void {
  onCleanup(deps.liveSessions.register(deps.sessionId, deps.active))

  let observed = false
  createEffect(() => {
    const now = deps.active()
    if (now === observed) return
    observed = now
    if (!now) deps.onSettle()
  })

  onCleanup(() => {
    if (!observed) return
    deps.invalidateSessions()
  })
}
