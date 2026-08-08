import type {UIMessage} from '@tanstack/ai'
import {ChatHistorySchema} from '@conciv/protocol/chat-types'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import {FILE_REF_PREFIX} from '@conciv/protocol/harness-types'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {getHarness} from '@conciv/harness'
import {
  deleteRunMessages,
  foldRichRunMessagesIntoHistory,
  foldRunMessagesIntoHistory,
  runMessagesFor,
  runSessions,
  sessionHistoryFor,
  type ConcivDb,
} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {rowById} from './session-rows.js'
import {normalizeHistoryToolNames} from './tool-names.js'
import {logError} from '../lib/debug.js'

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

async function readTranscript(
  harness: HarnessAdapter,
  cwd: string,
  nativeId: string,
  claudeHome?: string,
): Promise<UIMessage[]> {
  const history = harness.history
  if (!history) return []
  try {
    return await history.messages(cwd, nativeId, claudeHome)
  } catch (error) {
    logError(`[core] reading the transcript for ${nativeId} failed: ${String(error)}`)
    return []
  }
}

export type RecoveryScope = {db: ConcivDb; harness: HarnessAdapter; claudeHome?: string}

function recoveryHarness(booted: HarnessAdapter, harnessKind: string): HarnessAdapter | null {
  if (harnessKind === booted.id) return booted
  return getHarness(harnessKind) ?? null
}

function pendingUserText(db: ConcivDb, sessionId: string): string {
  const parsed = ChatHistorySchema.safeParse(runMessagesFor(db, sessionId)?.messages ?? [])
  if (!parsed.success) return ''
  const head = parsed.data[0]
  return head ? foldedText(userTextOf(head)) : ''
}

async function cliIngestedPending(scope: RecoveryScope, row: SessionRecord, harness: HarnessAdapter): Promise<boolean> {
  const nativeId = row.harnessSessionId
  if (nativeId === null) return false
  const pending = pendingUserText(scope.db, row.id)
  if (pending === '') return true
  const transcript = await readTranscript(harness, row.cwd, nativeId, scope.claudeHome)
  return transcript.some((message) => foldedText(withoutFileRefs(userTextOf(message))) === pending)
}

async function settlesAgainstTranscript(scope: RecoveryScope, sessionId: string): Promise<boolean> {
  const row = await rowById(scope.db, sessionId)
  if (!row) return false
  const harness = recoveryHarness(scope.harness, row.harnessKind)
  if (!harness?.capabilities.transcriptHistory) return false
  return cliIngestedPending(scope, row, harness)
}

export async function recoverInterruptedRuns(scope: RecoveryScope): Promise<void> {
  for (const sessionId of runSessions(scope.db)) {
    if (!(await settlesAgainstTranscript(scope, sessionId))) {
      foldRunMessagesIntoHistory(scope.db, sessionId)
      continue
    }
    foldRichRunMessagesIntoHistory(scope.db, sessionId)
    deleteRunMessages(scope.db, sessionId)
  }
}

function storedMessages(deps: ChatDeps, sessionId: string): UIMessage[] {
  const stored = [
    ...(sessionHistoryFor(deps.db, sessionId)?.messages ?? []),
    ...(runMessagesFor(deps.db, sessionId)?.messages ?? []),
  ]
  return ChatHistorySchema.parse(stored)
}

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
  if (!nativeId || !deps.harness.capabilities.transcriptHistory) {
    return normalizeHistoryToolNames(storedMessages(deps, sessionId), deps.toolNames)
  }
  const transcript = await readTranscript(deps.harness, deps.cwd, nativeId, deps.claudeHome)
  const messages = mergedMessages(transcript, storedMessages(deps, sessionId))
  return normalizeHistoryToolNames(messages, deps.toolNames)
}
