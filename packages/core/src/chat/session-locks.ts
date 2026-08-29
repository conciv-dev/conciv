import {InMemoryLockStore} from '@tanstack/ai/locks'
import type {SessionId} from '@conciv/protocol/chat-types'

export type SessionLocks = {
  serialize: <T>(sessionId: SessionId, section: () => Promise<T>) => Promise<T>
}

export function createSessionLocks(): SessionLocks {
  const locks = new InMemoryLockStore()
  return {serialize: (sessionId, section) => locks.withLock(sessionId, section)}
}
