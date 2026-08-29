import {uiMessageToModelMessages} from '@tanstack/ai'
import type {UIMessage} from '@tanstack/ai'
import {isSessionId} from '@conciv/protocol/chat-types'
import type {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {getHarness} from '@conciv/harness'
import {pendingThreadIds, updateThread, type ConcivDb, type ThreadAnchor, type ThreadState} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {rowById} from './session-rows.js'
import {sessionSnapshot, settleRunMessages} from './thread.js'
import {logError} from '../lib/debug.js'

export type TranscriptScope = {db: ConcivDb; harness: HarnessAdapter; claudeHome?: string}

async function readTranscript(
  harness: HarnessAdapter,
  cwd: string,
  nativeId: HarnessSessionId,
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

type Spoken = {role: string}

function userTurnCount(messages: readonly Spoken[]): number {
  return messages.filter((message) => message.role === 'user').length
}

function turnBoundary(messages: readonly Spoken[], turns: number): number {
  const seen = {count: 0}
  for (const [index, message] of messages.entries()) {
    if (message.role !== 'user') continue
    seen.count += 1
    if (seen.count > turns) return index
  }
  return messages.length
}

function freshTranscript(anchor: ThreadAnchor | null, transcript: UIMessage[]): UIMessage[] | null {
  if (anchor === null) return transcript
  if (anchor.nativeId === null) return null
  const index = transcript.findIndex((message) => message.id === anchor.nativeId)
  return index === -1 ? null : transcript.slice(index + 1)
}

export function importFold(state: ThreadState, transcript: UIMessage[]): ThreadState {
  const tailId = transcript.at(-1)?.id ?? null
  const anchor = tailId === null ? state.anchor : {nativeId: tailId}
  const fresh = freshTranscript(state.anchor, transcript)
  if (fresh === null) return {...state, anchor}
  const pending = state.pendingFrom === null ? [] : state.messages.slice(state.pendingFrom)
  const echoed = Math.min(userTurnCount(pending), userTurnCount(fresh))
  const novel = fresh.slice(turnBoundary(fresh, echoed))
  const settledFrom = state.pendingFrom === null ? null : state.pendingFrom + turnBoundary(pending, echoed)
  return {
    messages: [...state.messages, ...novel.flatMap(uiMessageToModelMessages)],
    pendingFrom: settledFrom !== null && settledFrom < state.messages.length ? settledFrom : null,
    anchor,
  }
}

export async function syncTranscript(scope: TranscriptScope, sessionId: SessionId): Promise<void> {
  if (!scope.harness.capabilities.transcriptHistory) return
  const row = await rowById(scope.db, sessionId)
  const nativeId = row?.harnessSessionId ?? null
  if (!row || !nativeId) return
  const transcript = await readTranscript(scope.harness, row.cwd, nativeId, scope.claudeHome)
  updateThread(scope.db, sessionId, (state) => importFold(state, transcript))
}

export async function syncedSnapshot(deps: ChatDeps, sessionId: SessionId): Promise<UIMessage[]> {
  if (!deps.liveRuns.running(sessionId)) await syncTranscript(deps, sessionId).catch(() => {})
  return sessionSnapshot(deps, sessionId)
}

function recoveryHarness(booted: HarnessAdapter, harnessKind: string): HarnessAdapter | null {
  if (harnessKind === booted.id) return booted
  return getHarness(harnessKind) ?? null
}

async function settlePendingThread(scope: TranscriptScope, sessionId: SessionId): Promise<void> {
  const row = await rowById(scope.db, sessionId)
  const harness = row ? recoveryHarness(scope.harness, row.harnessKind) : null
  if (harness) await syncTranscript({...scope, harness}, sessionId).catch(() => {})
  settleRunMessages(scope.db, sessionId)
}

export async function recoverInterruptedRuns(scope: TranscriptScope): Promise<void> {
  for (const sessionId of pendingThreadIds(scope.db).filter(isSessionId)) {
    await settlePendingThread(scope, sessionId)
  }
}
