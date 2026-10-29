import {createEffect, onCleanup} from 'solid-js'
import {useLiveSessions} from '../app/context.js'

export type SessionActivityDeps = {
  sessionId: string
  active: () => boolean
  invalidateSessions: () => void
  onSettle: () => void
}

export function trackSessionActivity(deps: SessionActivityDeps): void {
  onCleanup(useLiveSessions().register(deps.sessionId, deps.active))

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
