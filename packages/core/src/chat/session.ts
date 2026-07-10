import {randomUUID} from 'node:crypto'
import {and, eq, isNull} from 'drizzle-orm'
import {withoutTrailingSlash} from 'ufo'
import type {ChatCommand, ChatCommands, ChatSessionMeta, SessionRecord} from '@conciv/protocol/chat-types'
import {isSessionId, SessionRecordSchema} from '@conciv/protocol/chat-types'
import {sessions, type ConcivDb} from '@conciv/db'
import type {ChatDeps} from './runtime.js'

export type ResolveDeps = {
  db: ConcivDb
  harnessKind: string
  cwd: string
  mintId?: () => string
}

export async function sessionById(db: ConcivDb, id: string): Promise<SessionRecord | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id))
  return rows[0] ? SessionRecordSchema.parse(rows[0]) : null
}

export async function sessionByHarnessId(db: ConcivDb, harnessSessionId: string): Promise<SessionRecord | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.harnessSessionId, harnessSessionId))
  return rows[0] ? SessionRecordSchema.parse(rows[0]) : null
}

export async function createSession(
  db: ConcivDb,
  input: Omit<SessionRecord, 'createdAt' | 'updatedAt' | 'id'> & {id: string},
): Promise<SessionRecord> {
  const now = Date.now()
  const record = SessionRecordSchema.parse({...input, createdAt: now, updatedAt: now})
  await db.insert(sessions).values(record)
  return record
}

export async function resolveSession(deps: ResolveDeps, body: {id?: string}): Promise<{sessionId: string}> {
  const mint = deps.mintId ?? (() => `conciv_${randomUUID()}`)
  if (body.id && isSessionId(body.id)) {
    const existing = await sessionById(deps.db, body.id)
    if (existing) return {sessionId: existing.id}
  } else if (body.id) {
    const wrapped = await sessionByHarnessId(deps.db, body.id)
    if (wrapped) return {sessionId: wrapped.id}
    const adopted = await createSession(deps.db, {
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

export async function ensureAgentRecord(deps: ResolveDeps, harnessId: string): Promise<SessionRecord> {
  const existing = await sessionByHarnessId(deps.db, harnessId)
  if (existing) return existing
  const mint = deps.mintId ?? (() => `conciv_${randomUUID()}`)
  return createSession(deps.db, {
    id: mint(),
    harnessSessionId: harnessId,
    harnessKind: deps.harnessKind,
    origin: 'agent',
    title: null,
    model: null,
    usage: null,
    cwd: deps.cwd,
  })
}

const sameCwd = (a: string, b: string): boolean => withoutTrailingSlash(a) === withoutTrailingSlash(b)

export async function sweepEmptyChatRecords(db: ConcivDb): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.origin, 'chat'), isNull(sessions.harnessSessionId), isNull(sessions.title)))
}

export type HarnessRow = {id: string; derivedTitle: string; updatedAt: number; messageCount: number}

export async function buildSessionList(args: {
  db: ConcivDb
  harnessList: HarnessRow[]
  running: (sessionId: string) => boolean
  cwd: string
}): Promise<ChatSessionMeta[]> {
  const records = (await args.db.select().from(sessions)).filter((r) => sameCwd(r.cwd, args.cwd))
  const byHarness = new Map(records.filter((r) => r.harnessSessionId).map((r) => [r.harnessSessionId as string, r]))
  const harnessOf = (r: (typeof records)[number]): HarnessRow | undefined =>
    r.harnessSessionId ? args.harnessList.find((x) => x.id === r.harnessSessionId) : undefined
  const recordMeta = (r: (typeof records)[number], h: HarnessRow | undefined): ChatSessionMeta => {
    const merged = h ?? {derivedTitle: 'New session', updatedAt: r.updatedAt, messageCount: 0}
    return {
      id: r.id,
      title: r.title ?? merged.derivedTitle,
      updatedAt: merged.updatedAt,
      messageCount: merged.messageCount,
      running: args.running(r.id),
      origin: r.origin === 'external' ? 'external' : 'conciv',
      usage: r.usage,
    }
  }
  const ours = records.map((r) => recordMeta(r, harnessOf(r)))
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

export async function listCommands(
  deps: ChatDeps,
  opts: {sessionId?: string; origin: string},
): Promise<ChatCommands> {
  const commands = deps.harness.commands
  if (!commands) return {commands: []}
  const mcpUrl = deps.harness.capabilities.mcp === 'http' ? `${opts.origin}/api/mcp` : undefined
  const list = await commands({cwd: deps.cwd, sessionId: opts.sessionId, mcpUrl})
  return {
    commands: list.map((command) => ({
      name: command.name,
      description: command.description ?? '',
      ...(command.argumentHint ? {argumentHint: command.argumentHint} : {}),
      source: commandSource(command.name),
    })),
  }
}

function commandSource(name: string): ChatCommand['source'] {
  if (name.startsWith('mcp__')) return 'mcp'
  if (name.includes(':')) return 'plugin'
  return 'harness'
}
