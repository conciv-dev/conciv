import {createKeyedLocks} from '@conciv/ai/server'
import type {SessionId} from '@conciv/protocol/chat-types'

export type SessionLocks = {
  serialize: <T>(sessionId: SessionId, section: () => Promise<T>) => Promise<T>
}

export function createSessionLocks(): SessionLocks {
  return createKeyedLocks()
}
