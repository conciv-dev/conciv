import {createEffect, onCleanup} from 'solid-js'
import {useLiveSessions} from '../app/context.js'

export type SessionActivityDeps = {
  working: () => boolean
  invalidateSessions: () => void
  onStart: () => void
  onSettle: () => void
}

export function trackSessionActivity(deps: SessionActivityDeps): void {
  onCleanup(useLiveSessions().register(deps.working))

  let observed = false
  createEffect(() => {
    const now = deps.working()
    if (now === observed) return
    observed = now
    if (now) deps.onStart()
    if (!now) deps.onSettle()
  })

  onCleanup(() => {
    if (!observed) return
    deps.invalidateSessions()
  })
}
