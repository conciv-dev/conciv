import type {UiState} from '@conciv/db'
import type {ChatRuntime} from './chat-env.js'
import {startTurn} from './turn.js'
import {transcriptMessages} from './attach.js'

export const SESSION_BUSY = 'session busy'

export type Compactor = {run: (sessionId: string) => Promise<void>; compacting: (sessionId: string) => boolean}

export function makeCompactor(deps: {chat: ChatRuntime; uiState: UiState; onChange: () => void}): Compactor {
  const active = new Set<string>()

  async function run(sessionId: string): Promise<void> {
    const chat = deps.chat
    if (!chat.hub.reserve(sessionId)) throw new Error(SESSION_BUSY)
    active.add(sessionId)
    chat.onTurnStart?.(sessionId)
    deps.onChange()
    try {
      const history = await transcriptMessages(chat, sessionId)
      await deps.uiState.addMarker({sessionId, afterTurn: history.length, kind: 'compact'})
      await startTurn(chat, sessionId, {
        messages: [{role: 'user', content: '/compact'}],
        forwardedProps: {intent: 'compact'},
      })
    } finally {
      chat.hub.release(sessionId)
      active.delete(sessionId)
      deps.onChange()
    }
  }

  return {run, compacting: (sessionId) => active.has(sessionId)}
}
