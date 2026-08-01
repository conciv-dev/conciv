import {createEffect, on} from 'solid-js'

const THINKING = 'conciv is thinking…'
const REPLIED = 'conciv replied.'
const RECONNECTING = 'Reconnecting to conciv…'

export type TurnState = {
  status: () => string
  working: () => boolean
  disconnected: () => boolean
}

export type ChatAnnouncementDeps = {
  turn: TurnState
  announce: (message: string) => void
  invalidateSessions: () => void
  refreshMarkers: () => void
}

function turnLine(status: string, before: string): string | null {
  if (status === 'submitted') return THINKING
  if (before === 'streaming' && status !== 'streaming') return REPLIED
  return null
}

export function useChatAnnouncements(deps: ChatAnnouncementDeps): void {
  createEffect(
    on(deps.turn.working, (now, before = false) => {
      if (now === before) return
      deps.invalidateSessions()
      if (!now) deps.refreshMarkers()
    }),
  )

  createEffect(
    on(deps.turn.status, (now, before = '') => {
      const said = turnLine(now, before)
      if (said) deps.announce(said)
    }),
  )

  createEffect(() => {
    if (deps.turn.disconnected()) deps.announce(RECONNECTING)
  })
}
