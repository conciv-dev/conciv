import type {SessionId} from '@conciv/protocol/chat-types'
import {rememberableCommand} from './command-grammar.js'

type SessionCommands = {asked: Map<string, string>; allowed: Set<string>}

export type CommandMemory = {
  note: (sessionId: SessionId, approvalId: string, command: string) => void
  settle: (sessionId: SessionId, approvalId: string) => void
  remember: (sessionId: SessionId, approvalId: string) => void
  allows: (sessionId: SessionId, command: string) => boolean
}

export function createCommandMemory(): CommandMemory {
  const bySession = new Map<SessionId, SessionCommands>()

  const stateOf = (sessionId: SessionId): SessionCommands => {
    const existing = bySession.get(sessionId)
    if (existing) return existing
    const created: SessionCommands = {asked: new Map(), allowed: new Set()}
    bySession.set(sessionId, created)
    return created
  }

  return {
    note: (sessionId, approvalId, command) => {
      const normalized = rememberableCommand(command)
      if (normalized === null) return
      stateOf(sessionId).asked.set(approvalId, normalized)
    },
    settle: (sessionId, approvalId) => {
      bySession.get(sessionId)?.asked.delete(approvalId)
    },
    remember: (sessionId, approvalId) => {
      const state = bySession.get(sessionId)
      const normalized = state?.asked.get(approvalId)
      if (state === undefined || normalized === undefined) return
      state.allowed.add(normalized)
    },
    allows: (sessionId, command) => {
      const normalized = rememberableCommand(command)
      if (normalized === null) return false
      return bySession.get(sessionId)?.allowed.has(normalized) === true
    },
  }
}
