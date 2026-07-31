import {realpathSync} from 'node:fs'
import {isAbsolute, relative, resolve} from 'node:path'
import {and, eq, isNotNull} from 'drizzle-orm'
import {CONCIV_HOOK_PATH, isHarnessSessionId} from '@conciv/protocol/chat-types'
import type {HarnessHistory, HarnessLiveSession, HarnessSessionSummary} from '@conciv/protocol/harness-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {sessions, type ConcivDb} from '@conciv/db'
import type {LiveSession} from '@conciv/contract'
import {apiBaseFrom} from '../lib/api-base.js'
import {logError} from '../lib/debug.js'
import {mcpUrlFor, resolveSession, sessionById, transcriptRevision, transcriptTokenAllowed} from './session.js'
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

export type CandidateDeps = Pick<ChatDeps, 'cwd' | 'claudeHome' | 'harness' | 'dialed'>

const FACTS_MEMO_LIMIT = 64

const rememberedFacts = new Map<string, CandidateFacts>()

function recalled(key: string): CandidateFacts | undefined {
  const found = rememberedFacts.get(key)
  if (!found) return undefined
  rememberedFacts.delete(key)
  rememberedFacts.set(key, found)
  return found
}

function remember(key: string, facts: CandidateFacts): void {
  rememberedFacts.set(key, facts)
  while (rememberedFacts.size > FACTS_MEMO_LIMIT) {
    const oldest = rememberedFacts.keys().next()
    if (oldest.done) return
    rememberedFacts.delete(oldest.value)
  }
}

function blankFacts(session: HarnessLiveSession): CandidateFacts {
  return {title: '', messageCount: 0, lastActivityAt: session.startedAt ?? 0, tail: []}
}

function readableTranscript(deps: CandidateDeps, session: HarnessLiveSession): boolean {
  const history = deps.harness.history
  if (!history) return false
  return transcriptTokenAllowed(history, session.cwd, session.sessionId, deps.claudeHome)
}

function factsFromSummary(summary: HarnessSessionSummary): CandidateFacts {
  return {
    title: summary.meta.derivedTitle,
    messageCount: summary.meta.messageCount,
    lastActivityAt: summary.meta.updatedAt,
    tail: transcriptTail(summary.tail),
  }
}

async function factsFromMessages(
  deps: CandidateDeps,
  history: HarnessHistory,
  session: HarnessLiveSession,
): Promise<CandidateFacts> {
  const blank = blankFacts(session)
  const meta = await history.meta?.(session.cwd, session.sessionId, deps.claudeHome)
  const messages = await history.messages(session.cwd, session.sessionId, deps.claudeHome)
  return {
    title: meta?.derivedTitle ?? blank.title,
    messageCount: meta?.messageCount ?? messages.length,
    lastActivityAt: meta?.updatedAt ?? blank.lastActivityAt,
    tail: transcriptTail(messages),
  }
}

async function readFacts(
  deps: CandidateDeps,
  history: HarnessHistory,
  session: HarnessLiveSession,
): Promise<CandidateFacts> {
  const onePass = history.summary
  if (!onePass) return factsFromMessages(deps, history, session)
  const summary = await onePass(session.cwd, session.sessionId, deps.claudeHome)
  return summary ? factsFromSummary(summary) : blankFacts(session)
}

type CandidateHistory = CandidateFacts & Pick<LiveSession, 'historyStatus'>

function unreadable(session: HarnessLiveSession, detail: string): CandidateHistory {
  logError(`[core] cannot read the transcript of ${session.sessionId}: ${detail}`)
  return {...blankFacts(session), historyStatus: 'unavailable'}
}

async function candidateHistory(deps: CandidateDeps, session: HarnessLiveSession): Promise<CandidateHistory> {
  const history = deps.harness.history
  if (!history) return unreadable(session, `${deps.harness.id} keeps no transcripts`)
  if (!readableTranscript(deps, session)) return unreadable(session, 'that transcript is outside this project')
  const revision = await transcriptRevision(history, session.cwd, session.sessionId, deps.claudeHome)
  if ('ok' in revision) {
    if (revision.reason === 'missing') return {...blankFacts(session), historyStatus: 'ok'}
    return unreadable(session, revision.detail)
  }
  const key = `${session.sessionId}:${revision.rev}`
  const recalledFacts = recalled(key)
  if (recalledFacts) return {...recalledFacts, historyStatus: 'ok'}
  const facts = await readFacts(deps, history, session).catch((error: unknown) => String(error))
  if (typeof facts === 'string') return unreadable(session, facts)
  remember(key, facts)
  return {...facts, historyStatus: 'ok'}
}

async function toWire(deps: CandidateDeps, session: HarnessLiveSession): Promise<LiveSession[]> {
  const relation = cwdRelation(session.cwd, deps.cwd)
  if (relation === 'disjoint') return []
  const history = await candidateHistory(deps, session)
  const ready = deps.dialed(session.sessionId)
  return [{...session, ...history, relation, ready, working: session.status === 'busy'}]
}

export async function liveCandidates(deps: CandidateDeps): Promise<LiveSession[]> {
  const attach = deps.harness.attach
  if (!attach) return []
  const found = await attach.candidates(deps.cwd, deps.claudeHome)
  const wired = await Promise.all(found.map((session) => toWire(deps, session)))
  return wired.flat().toSorted((left, right) => right.lastActivityAt - left.lastActivityAt)
}

export type AdoptRequest = {harnessSessionId: string; pid: number; force: boolean; requestUrl: string}

export type AdoptFailureCode = 'CWD_MISMATCH' | 'INSTALL_FAILED' | 'ATTACH_CONFLICT' | 'ATTACH_FAILED'

export type AdoptOutcome =
  | {ok: true; sessionId: string; reloadCommand: string}
  | {ok: false; code: AdoptFailureCode; detail: string}

function pickCandidate(all: LiveSession[], request: AdoptRequest): LiveSession | undefined {
  return all.find((session) => session.sessionId === request.harnessSessionId && session.pid === request.pid)
}

type ClaimOutcome = {ok: true} | {ok: false; code: 'ATTACH_CONFLICT' | 'ATTACH_FAILED'; detail: string}

function claimAttachment(deps: ChatDeps, sessionId: string, candidate: LiveSession): ClaimOutcome {
  const alive = deps.processAlive ?? processAlive
  try {
    return deps.db.transaction((tx): ClaimOutcome => {
      const rows = tx.select({attachedPid: sessions.attachedPid}).from(sessions).where(eq(sessions.id, sessionId)).all()
      const held = rows[0]?.attachedPid ?? null
      if (held !== null && held !== candidate.pid && alive(held))
        return {ok: false, code: 'ATTACH_CONFLICT', detail: `another terminal (pid ${held}) already drives this chat`}
      const now = Date.now()
      tx.update(sessions)
        .set({attachedPid: candidate.pid, attachedAt: now, transcriptCwd: candidate.cwd, updatedAt: now})
        .where(eq(sessions.id, sessionId))
        .run()
      return {ok: true}
    })
  } catch (error) {
    return {ok: false, code: 'ATTACH_FAILED', detail: `could not record the attachment: ${String(error)}`}
  }
}

async function rollBackInstall(deps: ChatDeps, dependentsBefore: number): Promise<void> {
  if (dependentsBefore > 0) return
  const dependentsNow = await attachedCount(deps.db).catch(() => dependentsBefore)
  if (dependentsNow > 0) return
  await deps.harness.attach
    ?.uninstall({root: deps.cwd, stateDir: concivStateDir(deps.stateRoot)})
    .catch((error: unknown) => logError(`[core] rolling the connect plugin back failed: ${String(error)}`))
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
  const dependentsBefore = await attachedCount(deps.db)
  const installed = await attach
    .install({
      root: deps.cwd,
      stateDir: concivStateDir(deps.stateRoot),
      mcpUrl: mcpUrlFor(deps, request.requestUrl),
      hookUrl: `${apiBaseFrom(request.requestUrl, deps.basePath)}${CONCIV_HOOK_PATH}`,
    })
    .catch((error: unknown) => ({ok: false, reloadCommand: '', detail: String(error)}))
  if (!installed.ok)
    return {ok: false, code: 'INSTALL_FAILED', detail: installed.detail ?? 'claude refused the conciv plugin'}

  const claimed = claimAttachment(deps, sessionId, candidate)
  if (!claimed.ok) {
    if (claimed.code === 'ATTACH_FAILED') await rollBackInstall(deps, dependentsBefore)
    return {ok: false, code: claimed.code, detail: claimed.detail}
  }
  deps.changes.notify()
  return {ok: true, sessionId, reloadCommand: installed.reloadCommand}
}

async function clearAttachment(db: ConcivDb, sessionId: string): Promise<boolean> {
  const cleared = await db
    .update(sessions)
    .set({attachedPid: null, attachedAt: null, updatedAt: Date.now()})
    .where(and(eq(sessions.id, sessionId), isNotNull(sessions.attachedPid)))
    .returning({id: sessions.id})
  return cleared.length > 0
}

async function attachedCount(db: ConcivDb): Promise<number> {
  return (await db.select({id: sessions.id}).from(sessions).where(isNotNull(sessions.attachedPid))).length
}

export async function detachLiveSession(deps: ChatDeps, sessionId: string): Promise<boolean> {
  if (!(await clearAttachment(deps.db, sessionId))) return false
  deps.onSessionDetached?.(sessionId)
  deps.changes.notify()
  if ((await attachedCount(deps.db)) > 0) return true
  await deps.harness.attach
    ?.uninstall({root: deps.cwd, stateDir: concivStateDir(deps.stateRoot)})
    .catch((error: unknown) => logError(`[core] detach failed: ${String(error)}`))
  return true
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function stillListed(deps: ChatDeps, pid: number, harnessSessionId: string | null): Promise<boolean> {
  const attach = deps.harness.attach
  if (!attach || harnessSessionId === null) return true
  const found = await attach.candidates(deps.cwd, deps.claudeHome).catch((error: unknown) => {
    logError(`[core] rechecking the attached ${deps.harness.id} session failed: ${String(error)}`)
    return null
  })
  if (found === null) return true
  return found.some((session) => session.pid === pid && session.sessionId === harnessSessionId)
}

export async function attachedElsewhere(deps: ChatDeps, sessionId: string): Promise<boolean> {
  const record = await sessionById(deps.db, sessionId)
  const pid = record?.attachedPid ?? null
  if (pid === null) return false
  const alive = deps.processAlive ?? processAlive
  if (alive(pid) && (await stillListed(deps, pid, record?.harnessSessionId ?? null))) return true
  await clearAttachment(deps.db, sessionId)
  deps.changes.notify()
  return false
}

export async function detachAllAttached(deps: ChatDeps): Promise<void> {
  const rows = await deps.db.select({id: sessions.id}).from(sessions).where(isNotNull(sessions.attachedPid))
  if (rows.length === 0) return
  for (const row of rows) {
    await clearAttachment(deps.db, row.id)
    deps.onSessionDetached?.(row.id)
  }
  await deps.harness.attach
    ?.uninstall({root: deps.cwd, stateDir: concivStateDir(deps.stateRoot)})
    .catch((error: unknown) => logError(`[core] detach on shutdown failed: ${String(error)}`))
}
