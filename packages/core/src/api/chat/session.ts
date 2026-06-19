import {randomUUID} from 'node:crypto'
import {withoutTrailingSlash} from 'ufo'
import {type H3, HTTPError, readValidatedBody} from 'h3'
import {resolveHarnessModels} from '@mandarax/harness'
import type {HarnessAdapter} from '@mandarax/protocol/harness-types'
import type {ChatSession, ChatModels, ChatSessions, ChatSessionMeta} from '@mandarax/protocol/chat-types'
import {RenameSessionSchema, ResolveRequestSchema, isSessionId} from '@mandarax/protocol/chat-types'
import type {SessionStore} from '../../store/session-store.js'
import {readLock, readLocks} from '../../store/lock.js'
import {readFileOrEmpty} from '../../fs.js'
import {sessionIdFromHeaders} from './session-id.js'

// The session/models/history/resolve/rename/delete routes. Every route keys off our mandarax_ id (the
// MANDARAX_SESSION_HEADER); `resolve` is the ONLY route that accepts a raw harness id, normalizing it.

export type SessionRouteDeps = {
  cwd: string
  stateRoot: string
  store: SessionStore
  harness: HarnessAdapter
  claudeHome?: string // injectable transcript home for hist.list (tests); default homedir()
}

// Deps for the pure id-normalization helpers (resolve + agent hand-off seeding).
export type ResolveDeps = {
  store: SessionStore
  harnessKind: string
  cwd: string
  mintId?: () => string
}

// Normalize any id to one of ours: our id → return it; raw harness id → find-or-create a wrapping
// record (idempotent); no/unknown id → mint a fresh id WITHOUT persisting. The only id-normalization
// seam. Fresh chat ids stay record-less until their first turn (turn.ts), so an abandoned New-session
// never leaves a ghost "New session · 0 messages" row in the picker.
export async function resolveSession(deps: ResolveDeps, body: {id?: string}): Promise<{sessionId: string}> {
  const mint = deps.mintId ?? (() => `mandarax_${randomUUID()}`)
  if (body.id && isSessionId(body.id)) {
    const existing = await deps.store.get(body.id)
    if (existing) return {sessionId: existing.id}
    // unknown mandarax id (lost record) → fall through and mint fresh
  } else if (body.id) {
    const wrapped = await deps.store.findByHarnessId(body.id)
    if (wrapped) return {sessionId: wrapped.id}
    const adopted = await deps.store.create({
      id: mint(),
      harnessSessionId: body.id,
      harnessKind: deps.harnessKind,
      origin: 'external',
      title: null,
      model: null,
      usage: null,
      cwd: deps.cwd,
    })
    return {sessionId: adopted.id}
  }
  return {sessionId: mint()}
}

// Same on-disk working directory, tolerant of a trailing-slash difference between when a record was
// written and the live cwd. ufo handles the path-segment normalization.
const sameCwd = (a: string, b: string): boolean => withoutTrailingSlash(a) === withoutTrailingSlash(b)

// Remove legacy ghost records: chat-origin sessions with no resume token and no user title — created
// eagerly by the old resolve before lazy-birth and never messaged. Skips currently-locked ids (an
// in-flight first turn holds a record in exactly this null/null shape until the harness mints a
// token). Best-effort, boot-time; never touches external/agent records or titled/run sessions.
export async function sweepEmptyChatRecords(store: SessionStore, locked: Set<string>): Promise<void> {
  const records = await store.list()
  for (const r of records) {
    if (r.origin === 'chat' && r.harnessSessionId === null && r.title === null && !locked.has(r.id)) {
      await store.delete(r.id)
    }
  }
}

// A harness transcript row (from harness.history.list) before joining to our records.
export type HarnessRow = {id: string; derivedTitle: string; updatedAt: number; messageCount: number}

// Read-only list = our records (id = mandarax_) ∪ unwrapped harness transcripts (id = raw harness id),
// joined to live transcript data + lock state. NEVER writes — records are minted only via resolve.
// Scoped to the current cwd: records carry the cwd they were created in, and the harness transcript
// list is already cwd-filtered by its caller, so the two halves agree on scope.
export async function buildSessionList(args: {
  store: SessionStore
  harnessList: HarnessRow[]
  runningKeys: Set<string>
  cwd: string
}): Promise<ChatSessionMeta[]> {
  const records = (await args.store.list()).filter((r) => sameCwd(r.cwd, args.cwd))
  const byHarness = new Map(records.filter((r) => r.harnessSessionId).map((r) => [r.harnessSessionId as string, r]))
  const ours = records.map((r) => {
    const h = r.harnessSessionId ? args.harnessList.find((x) => x.id === r.harnessSessionId) : undefined
    return {
      id: r.id,
      title: r.title ?? h?.derivedTitle ?? 'New session',
      updatedAt: h?.updatedAt ?? r.updatedAt,
      messageCount: h?.messageCount ?? 0,
      running: args.runningKeys.has(r.id),
      origin: r.origin === 'external' ? 'external' : 'mandarax',
      usage: r.usage,
    } satisfies ChatSessionMeta
  })
  const unwrapped = args.harnessList
    .filter((h) => !byHarness.has(h.id))
    .map(
      (h) =>
        ({
          id: h.id,
          title: h.derivedTitle,
          updatedAt: h.updatedAt,
          messageCount: h.messageCount,
          running: false,
          origin: 'external',
          usage: null,
        }) satisfies ChatSessionMeta,
    )
  return [...ours, ...unwrapped].toSorted((a, b) => b.updatedAt - a.updatedAt)
}

// The harness session name from its transcript, or null (no token / no name hook / no file).
function nameFor(deps: SessionRouteDeps, token: string | null): string | null {
  const hist = deps.harness.history
  if (!token || !hist?.nameFromTranscript) return null
  const raw = readFileOrEmpty(hist.transcriptPath(deps.cwd, token))
  return raw ? hist.nameFromTranscript(raw) : null
}

// Kill a session's live turn (best-effort SIGTERM) if a lock holds a pid.
function killLock(stateRoot: string, sessionId: string): void {
  const lock = readLock(stateRoot, sessionId)
  if (!lock.pid) return
  try {
    process.kill(lock.pid, 'SIGTERM')
  } catch {
    // already gone
  }
}

export function registerSessionRoutes(app: H3, deps: SessionRouteDeps): void {
  // POST /api/chat/session/resolve → the only id-normalization seam: returns {sessionId: mandarax_}.
  app.post('/api/chat/session/resolve', async (event) => {
    const body = await readValidatedBody(event, ResolveRequestSchema)
    return resolveSession({store: deps.store, harnessKind: deps.harness.id, cwd: deps.cwd}, body)
  })

  // GET /api/chat/session → the record for our id + harness identity. No header → 400. A valid but
  // record-less id (lazy-resolved, no turn yet) reports a fresh empty session, NOT 404, so the widget
  // can label and open it before the first message persists the record.
  app.get('/api/chat/session', async (event): Promise<ChatSession> => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    if (!sessionId) throw new HTTPError({status: 400, message: 'no session'})
    const harness = {
      id: deps.harness.id,
      name: deps.harness.displayName ?? deps.harness.id,
      canLaunch: Boolean(deps.harness.launch),
    }
    const record = await deps.store.get(sessionId)
    if (!record) {
      return {
        sessionId: sessionId as ChatSession['sessionId'],
        harnessSessionId: null,
        name: null,
        origin: 'chat',
        cwd: deps.cwd,
        lock: {held: false, role: null},
        usage: null,
        harness,
      }
    }
    const lock = readLock(deps.stateRoot, record.id)
    return {
      sessionId: record.id as ChatSession['sessionId'],
      harnessSessionId: record.harnessSessionId,
      name: record.title ?? nameFor(deps, record.harnessSessionId),
      origin: record.origin,
      cwd: deps.cwd,
      lock: {held: lock.held, role: lock.role},
      usage: record.usage,
      harness,
    }
  })

  app.get('/api/chat/models', async (): Promise<ChatModels> => {
    const models = await resolveHarnessModels(deps.harness)
    const defaultModel = deps.harness.defaultModel ?? models[0]?.id ?? null
    return {
      models,
      defaultModel,
      harness: {
        id: deps.harness.id,
        name: deps.harness.displayName ?? deps.harness.id,
        canLaunch: Boolean(deps.harness.launch),
      },
    }
  })

  // GET /api/chat/history → prior turns for our id (record.harnessSessionId ? transcript : []).
  app.get('/api/chat/history', async (event) => {
    if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
    const sessionId = sessionIdFromHeaders(event.req.headers)
    const record = sessionId ? await deps.store.get(sessionId) : null
    if (!record?.harnessSessionId) return []
    const jsonl = readFileOrEmpty(deps.harness.history.transcriptPath(deps.cwd, record.harnessSessionId))
    return jsonl ? deps.harness.history.parse(jsonl) : []
  })

  // GET /api/chat/sessions → read-only list: our records ∪ unwrapped harness transcripts.
  app.get('/api/chat/sessions', async (): Promise<ChatSessions> => {
    const hist = deps.harness.history
    const harnessList =
      deps.harness.capabilities.transcriptHistory && hist?.list ? await hist.list(deps.cwd, deps.claudeHome) : []
    const runningKeys = new Set(readLocks(deps.stateRoot).map((l) => l.key))
    const sessions = await buildSessionList({store: deps.store, harnessList, runningKeys, cwd: deps.cwd})
    return {sessions}
  })

  // POST /api/chat/sessions/title → set (or clear) a session's user title on its record. Strips
  // C0/C1 control characters and collapses whitespace before persisting.
  app.post('/api/chat/sessions/title', async (event) => {
    const {sessionId, title} = await readValidatedBody(event, RenameSessionSchema)
    const clean = title
      .replace(/\p{Cc}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
    await deps.store.update(sessionId, {title: clean})
    return {ok: true, title: clean}
  })

  // DELETE /api/chat/session → forget a session (pane closed): kill its live turn + delete its record.
  app.delete('/api/chat/session', async (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    if (!sessionId) throw new HTTPError({status: 400, message: 'no session'})
    killLock(deps.stateRoot, sessionId)
    await deps.store.delete(sessionId)
    return {ok: true}
  })

  app.post('/api/chat/stop', (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    if (sessionId) killLock(deps.stateRoot, sessionId)
    return {ok: true}
  })
}
