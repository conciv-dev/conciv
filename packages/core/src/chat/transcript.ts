import type {UIMessage} from '@tanstack/ai'
import {ChatHistorySchema} from '@conciv/protocol/chat-types'
import {FILE_REF_PREFIX} from '@conciv/protocol/harness-types'
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

function userTextOf(message: UIMessage): string {
  if (message.role !== 'user' || !Array.isArray(message.parts)) return ''
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (typeof part.content === 'string' ? part.content : ''))
    .join('\n')
}

function withoutFileRefs(text: string): string {
  const index = text.lastIndexOf(FILE_REF_PREFIX)
  return index === -1 ? text : text.slice(0, index)
}

const foldedText = (value: string): string => value.replace(/\s+/g, ' ').trim()

function settledTranscript(transcript: UIMessage[], stored: UIMessage[]): UIMessage[] {
  const head = stored[0]
  if (!head || head.role !== 'user') return transcript
  const pending = foldedText(userTextOf(head))
  const index = transcript.findLastIndex(
    (message) => message.role === 'user' && foldedText(withoutFileRefs(userTextOf(message))) === pending,
  )
  if (index === -1) return transcript
  return transcript.slice(0, index)
}

function mergedMessages(transcript: UIMessage[], stored: UIMessage[]): UIMessage[] {
  if (stored.length === 0) return transcript
  return [...settledTranscript(transcript, stored), ...stored]
}

export async function sessionSnapshot(deps: ChatDeps, sessionId: string): Promise<UIMessage[]> {
  const row = await rowById(deps.db, sessionId)
  const nativeId = row?.harnessSessionId ?? null
  const transcript =
    nativeId && deps.harness.capabilities.transcriptHistory ? await transcriptMessages(deps, nativeId) : []
  const messages = mergedMessages(transcript, storedMessages(deps, sessionId))
  return deps.snapshots.keep(sessionId, normalizeHistoryToolNames(messages, deps.toolNames))
}
