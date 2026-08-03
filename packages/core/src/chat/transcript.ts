import type {UIMessage} from '@tanstack/ai'
import {ChatHistorySchema} from '@conciv/protocol/chat-types'
import {imageHistoryFor, runMessagesFor} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {rowById} from './session-rows.js'
import {normalizeHistoryToolNames} from './tool-names.js'
import {logError} from '../lib/debug.js'

export type SnapshotCache = {
  keep: (rowId: string, messages: UIMessage[]) => UIMessage[]
  clear: (rowId: string) => void
}

export function createSnapshotCache(): SnapshotCache {
  const served = new Map<string, UIMessage[]>()
  return {
    keep: (rowId, messages) => {
      const previous = served.get(rowId)
      if (previous && messages.length < previous.length) return previous
      served.set(rowId, messages)
      return messages
    },
    clear: (rowId) => {
      served.delete(rowId)
    },
  }
}

function storedMessages(deps: ChatDeps, sessionId: string): UIMessage[] {
  const stored = [
    ...(imageHistoryFor(deps.db, sessionId)?.messages ?? []),
    ...(runMessagesFor(deps.db, sessionId)?.messages ?? []),
  ]
  return ChatHistorySchema.parse(stored)
}

async function transcriptMessages(deps: ChatDeps, nativeId: string): Promise<UIMessage[]> {
  const history = deps.harness.history
  if (!history) return []
  return history.messages(deps.cwd, nativeId, deps.claudeHome).catch((error: unknown) => {
    logError(`[core] reading the transcript for ${nativeId} failed: ${String(error)}`)
    return []
  })
}

export async function sessionSnapshot(deps: ChatDeps, sessionId: string): Promise<UIMessage[]> {
  const row = await rowById(deps.db, sessionId)
  const nativeId = row?.harnessSessionId ?? null
  const messages =
    nativeId && deps.harness.capabilities.transcriptHistory
      ? await transcriptMessages(deps, nativeId)
      : storedMessages(deps, sessionId)
  return deps.snapshots.keep(sessionId, normalizeHistoryToolNames(messages, deps.toolNames))
}
