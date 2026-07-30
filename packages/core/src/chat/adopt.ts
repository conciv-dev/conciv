import {realpathSync} from 'node:fs'
import {isAbsolute, relative, resolve} from 'node:path'
import {eq, isNotNull} from 'drizzle-orm'
import {CONCIV_HOOK_PATH, isHarnessSessionId} from '@conciv/protocol/chat-types'
import type {HarnessLiveSession} from '@conciv/protocol/harness-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {sessions, type ConcivDb} from '@conciv/db'
import type {LiveSession} from '@conciv/contract'
import {apiBaseFrom} from '../lib/api-base.js'
import {logError} from '../lib/debug.js'
import {mcpUrlFor, resolveSession, sessionById, transcriptTokenAllowed} from './session.js'
import {transcriptTail} from './transcript-tail.js'
import type {ChatDeps} from './runtime.js'

export const SESSION_ATTACHED = 'session attached'

export type CwdRelation = 'same' | 'ancestor' | 'descendant' | 'disjoint'

function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

export function cwdRelation(candidateCwd: string, engineCwd: string): CwdRelation {
  const from = realpathOrSelf(candidateCwd)
  const to = realpathOrSelf(engineCwd)
  if (from === to) return 'same'
  const inside = (parent: string, child: string): boolean => {
    const step = relative(parent, child)
    return step.length > 0 && !step.startsWith('..') && !isAbsolute(step)
  }
  if (inside(from, to)) return 'ancestor'
  if (inside(to, from)) return 'descendant'
  return 'disjoint'
}

type CandidateFacts = Pick<LiveSession, 'title' | 'messageCount' | 'lastActivityAt' | 'tail'>

function blankFacts(session: HarnessLiveSession): CandidateFacts {
  return {title: '', messageCount: 0, lastActivityAt: session.startedAt ?? 0, tail: []}
}

function readableTranscript(deps: ChatDeps, session: HarnessLiveSession): boolean {
  const history = deps.harness.history
  if (!history) return false
  return transcriptTokenAllowed(history, session.cwd, session.sessionId, deps.claudeHome)
}

async function candidateFacts(deps: ChatDeps, session: HarnessLiveSession): Promise<CandidateFacts> {
  const history = deps.harness.history
  const blank = blankFacts(session)
  if (!history) return blank
  const meta = await history.meta?.(session.cwd, session.sessionId, deps.claudeHome).catch(() => null)
  const messages = await history.messages(session.cwd, session.sessionId, deps.claudeHome).catch(() => [])
  return {
    title: meta?.derivedTitle ?? blank.title,
    messageCount: meta?.messageCount ?? messages.length,
    lastActivityAt: meta?.updatedAt ?? blank.lastActivityAt,
    tail: transcriptTail(messages),
  }
}

async function toWire(deps: ChatDeps, session: HarnessLiveSession): Promise<LiveSession[]> {
  const relation = cwdRelation(session.cwd, deps.cwd)
  if (relation === 'disjoint') return []
  const facts = readableTranscript(deps, session) ? await candidateFacts(deps, session) : blankFacts(session)
  const ready = deps.dialed(session.sessionId)
  return [{...session, ...facts, relation, ready, working: session.status === 'busy'}]
}

export async function liveCandidates(deps: ChatDeps): Promise<LiveSession[]> {
  const attach = deps.harness.attach
  if (!attach) return []
  const found = await attach.candidates(deps.cwd, deps.claudeHome).catch((error: unknown) => {
    logError(`[core] listing live ${deps.harness.id} sessions failed: ${String(error)}`)
    return []
  })
  const wired = await Promise.all(found.map((session) => toWire(deps, session)))
  return wired.flat().toSorted((left, right) => right.lastActivityAt - left.lastActivityAt)
}

export type AdoptRequest = {harnessSessionId: string; pid: number; force: boolean; requestUrl: string}

export type AdoptOutcome =
  | {ok: true; sessionId: string; reloadCommand: string}
  | {ok: false; code: 'CWD_MISMATCH' | 'INSTALL_FAILED'; detail: string}

function pickCandidate(all: LiveSession[], request: AdoptRequest): LiveSession | undefined {
  return all.find((session) => session.sessionId === request.harnessSessionId && session.pid === request.pid)
}

export async function adoptLiveSession(deps: ChatDeps, request: AdoptRequest): Promise<AdoptOutcome> {
  if (!isHarnessSessionId(request.harnessSessionId))
    return {ok: false, code: 'CWD_MISMATCH', detail: 'that is not a valid session id'}
  const attach = deps.harness.attach
  if (!attach) return {ok: false, code: 'INSTALL_FAILED', detail: `${deps.harness.id} cannot connect to a live session`}
  const candidate = pickCandidate(await liveCandidates(deps), request)
  if (!candidate) return {ok: false, code: 'CWD_MISMATCH', detail: 'that session is not running in this project'}
  if (candidate.relation === 'descendant' && !request.force)
    return {ok: false, code: 'CWD_MISMATCH', detail: `that session runs in ${candidate.cwd}, inside this project`}

  const {sessionId} = await resolveSession(
    {db: deps.db, harnessKind: deps.harness.id, cwd: deps.cwd},
    {id: candidate.sessionId},
  )
  await deps.db
    .update(sessions)
    .set({attachedPid: candidate.pid, attachedAt: Date.now(), transcriptCwd: candidate.cwd, updatedAt: Date.now()})
    .where(eq(sessions.id, sessionId))
  deps.changes.notify()

  const installed = await attach.install({
    root: deps.cwd,
    stateDir: concivStateDir(deps.stateRoot),
    mcpUrl: mcpUrlFor(deps, request.requestUrl),
    hookUrl: `${apiBaseFrom(request.requestUrl, deps.basePath)}${CONCIV_HOOK_PATH}`,
  })
  if (!installed.ok) {
    await clearAttachment(deps.db, sessionId)
    deps.changes.notify()
    return {ok: false, code: 'INSTALL_FAILED', detail: installed.detail ?? 'claude refused the conciv plugin'}
  }
  return {ok: true, sessionId, reloadCommand: installed.reloadCommand}
}

async function clearAttachment(db: ConcivDb, sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({attachedPid: null, attachedAt: null, updatedAt: Date.now()})
    .where(eq(sessions.id, sessionId))
}

async function attachedCount(db: ConcivDb): Promise<number> {
  return (await db.select({id: sessions.id}).from(sessions).where(isNotNull(sessions.attachedPid))).length
}

export async function detachLiveSession(deps: ChatDeps, sessionId: string): Promise<void> {
  await clearAttachment(deps.db, sessionId)
  deps.changes.notify()
  if ((await attachedCount(deps.db)) > 0) return
  await deps.harness.attach
    ?.uninstall({root: deps.cwd, stateDir: concivStateDir(deps.stateRoot)})
    .catch((error: unknown) => logError(`[core] detach failed: ${String(error)}`))
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function attachedElsewhere(deps: ChatDeps, sessionId: string): Promise<boolean> {
  const record = await sessionById(deps.db, sessionId)
  const pid = record?.attachedPid ?? null
  if (pid === null) return false
  if (processAlive(pid)) return true
  await clearAttachment(deps.db, sessionId)
  deps.changes.notify()
  return false
}

export async function detachAllAttached(deps: ChatDeps): Promise<void> {
  const rows = await deps.db.select({id: sessions.id}).from(sessions).where(isNotNull(sessions.attachedPid))
  if (rows.length === 0) return
  for (const row of rows) await clearAttachment(deps.db, row.id)
  await deps.harness.attach
    ?.uninstall({root: deps.cwd, stateDir: concivStateDir(deps.stateRoot)})
    .catch((error: unknown) => logError(`[core] detach on shutdown failed: ${String(error)}`))
}
