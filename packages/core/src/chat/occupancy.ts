import {readFile} from 'node:fs/promises'
import {eq} from 'drizzle-orm'
import {sessions} from '@conciv/db'
import {transcriptPathWithin} from '@conciv/harness'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import type {ChatDeps} from './runtime.js'
import {nativeIdFor, rowById} from './session-rows.js'

export async function contextOccupancyFor(deps: ChatDeps, sessionId: SessionId): Promise<number | undefined> {
  const history = deps.harness.history
  if (!history?.contextTokens || !history.transcriptPath) return undefined
  const nativeId = await nativeIdFor(deps.db, sessionId)
  if (!nativeId) return undefined
  const path = transcriptPathWithin(history, deps.cwd, nativeId, deps.claudeHome)
  if (path === null) return undefined
  const raw = await readFile(path, 'utf8').catch(() => null)
  return raw === null ? undefined : history.contextTokens(raw)
}

function withOccupancy(usage: UsageSnapshot, contextTokens: number): UsageSnapshot {
  return {...usage, contextTokens}
}

export async function settleContextOccupancy(deps: ChatDeps, sessionId: SessionId): Promise<void> {
  const contextTokens = await contextOccupancyFor(deps, sessionId)
  if (contextTokens === undefined) return
  const usage = (await rowById(deps.db, sessionId))?.usage
  if (!usage) return
  await deps.db
    .update(sessions)
    .set({usage: withOccupancy(usage, contextTokens), updatedAt: Date.now()})
    .where(eq(sessions.id, sessionId))
  if (deps.onRunEnd) await deps.onRunEnd(sessionId)
}
