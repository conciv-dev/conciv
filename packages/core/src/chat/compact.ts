import type {UiState} from '@conciv/db'
import type {ChatRuntime} from './chat-env.js'
import {startTurn} from './turn.js'
import {transcriptMessages} from './attach.js'
import {acquireLock, releaseLock} from '../store/lock.js'

export const SESSION_BUSY = 'session busy'

export type Compactor = {run: (sessionId: string) => Promise<void>; compacting: (sessionId: string) => boolean}

export function makeCompactor(deps: {chat: ChatRuntime; uiState: UiState; onChange: () => void}): Compactor {
  const active = new Set<string>()

  async function run(sessionId: string): Promise<void> {
    const chat = deps.chat
    if (chat.hub.generating(sessionId) || active.has(sessionId)) throw new Error(SESSION_BUSY)
    if (!acquireLock(chat.stateRoot, sessionId, 'chat', process.pid)) throw new Error(SESSION_BUSY)
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
      await waitForIdle(chat, sessionId)
    } finally {
      active.delete(sessionId)
      releaseLock(chat.stateRoot, sessionId)
      deps.onChange()
    }
  }

  return {run, compacting: (sessionId) => active.has(sessionId)}
}

async function waitForIdle(chat: ChatRuntime, sessionId: string): Promise<void> {
  const deadline = Date.now() + 3000
  while (!chat.hub.generating(sessionId) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  while (chat.hub.generating(sessionId)) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
