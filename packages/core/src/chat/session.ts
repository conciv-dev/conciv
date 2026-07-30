import {randomUUID} from 'node:crypto'
import {and, eq, isNull} from 'drizzle-orm'
import {withoutTrailingSlash} from 'ufo'
import type {ContentPart, ModelMessage} from '@tanstack/ai'
import type {
  ChatCommand,
  ChatCommands,
  ChatHistory,
  ChatLaunch,
  ChatMessage,
  ChatSessionMeta,
  SessionRecord,
  SessionRecordInput,
} from '@conciv/protocol/chat-types'
import {isSessionId, SessionRecordSchema} from '@conciv/protocol/chat-types'
import {FILE_REF_PREFIX} from '@conciv/protocol/harness-types'
import type {HarnessAdapter, HarnessConnectPlan} from '@conciv/protocol/harness-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {sessions, type ConcivDb} from '@conciv/db'
import {apiBaseFrom} from '../lib/api-base.js'
import {executeConnectPlan} from './connect-exec.js'
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

export async function transcriptCwdFor(db: ConcivDb, token: string): Promise<string | null> {
  return (await sessionByHarnessId(db, token))?.transcriptCwd ?? null
}

export const resumeTokenFor = async (db: ConcivDb, id: string): Promise<string | null> =>
  (await sessionById(db, id))?.harnessSessionId ?? null

export async function resumableToken(
  db: ConcivDb,
  harness: HarnessAdapter,
  cwd: string,
  token: string | null,
  home?: string,
): Promise<string | null> {
  if (!token) return null
  const history = harness.history
  if (!history) return token
  const transcriptCwd = (await transcriptCwdFor(db, token)) ?? cwd
  return (await history.transcriptStat(transcriptCwd, token, home)) ? token : null
}

export const recordMintedToken = (db: ConcivDb, id: string, token: string): Promise<unknown> =>
  db.update(sessions).set({harnessSessionId: token, updatedAt: Date.now()}).where(eq(sessions.id, id))

export const ensureChatRecord = async (db: ConcivDb, id: string, harnessKind: string, cwd: string): Promise<void> => {
  if (await sessionById(db, id)) return
  await createSession(db, {
    id,
    harnessSessionId: null,
    harnessKind,
    origin: 'chat',
    title: null,
    model: null,
    usage: null,
    cwd,
  })
}

export async function createSession(
  db: ConcivDb,
  input: Omit<SessionRecordInput, 'createdAt' | 'updatedAt'>,
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
  opts: {sessionId?: string; requestUrl: string},
): Promise<ChatCommands> {
  const commands = deps.harness.commands
  if (!commands) return {commands: []}
  const mcpUrl = deps.harness.capabilities.mcp === 'http' ? mcpUrlFor(deps, opts.requestUrl) : undefined
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

type Part = {type: string; content?: unknown}
type HistoryMessage = {role: string; parts: ReadonlyArray<Part>}

export function userText(message: HistoryMessage): string {
  if (message.role !== 'user') return ''
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (typeof part.content === 'string' ? part.content : ''))
    .join('\n')
}

function withoutFileRefs(text: string): string {
  const index = text.lastIndexOf(FILE_REF_PREFIX)
  return index === -1 ? text : text.slice(0, index)
}

const normalizedText = (value: string): string => value.replace(/\s+/g, ' ').trim()

export function settledMessages(messages: ChatHistory, pendingUserText: string | null): ChatHistory {
  if (pendingUserText === null) return messages
  const pending = normalizedText(pendingUserText)
  const index = messages.findLastIndex(
    (message) =>
      message.role === 'user' && normalizedText(withoutFileRefs(userText(message as HistoryMessage))) === pending,
  )
  if (index === -1) return messages
  return messages.slice(0, index)
}

function messageText(m: ChatMessage): string {
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content)) {
    return m.content
      .filter((p) => p.type === 'text')
      .map((p) => p.content ?? '')
      .join('\n')
  }
  if (!m.parts) return ''
  return m.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.content ?? '')
    .join('\n')
}

function modelContent(m: ChatMessage): string | ContentPart[] {
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content)) {
    return m.content.flatMap((p): ContentPart[] => {
      if (p.type === 'image' && p.source && p.source.type === 'data' && p.source.mimeType) {
        return [{type: 'image', source: {type: 'data', value: p.source.value, mimeType: p.source.mimeType}}]
      }
      if (p.type === 'text') return [{type: 'text', content: p.content ?? ''}]
      return []
    })
  }
  return messageText(m)
}

function modelRole(role: string): 'user' | 'assistant' | 'tool' {
  if (role === 'assistant') return 'assistant'
  if (role === 'tool') return 'tool'
  return 'user'
}

export function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages.map((m) => ({role: modelRole(m.role), content: modelContent(m)}))
}

function mcpUrlFor(deps: ChatDeps, requestUrl: string): string {
  return `${apiBaseFrom(requestUrl, deps.basePath)}/api/mcp`
}

export type LaunchOptions = {sessionId: string; model?: string; requestUrl: string}

async function harnessToken(deps: ChatDeps, sessionId: string): Promise<{token: string; resume: boolean}> {
  const existing = await resumeTokenFor(deps.db, sessionId)
  if (!existing) {
    const minted = randomUUID()
    await recordMintedToken(deps.db, sessionId, minted)
    return {token: minted, resume: false}
  }
  const resumable = await resumableToken(deps.db, deps.harness, deps.cwd, existing, deps.claudeHome)
  return {token: existing, resume: resumable !== null}
}

export async function connectPlanFor(deps: ChatDeps, opts: LaunchOptions): Promise<HarnessConnectPlan | null> {
  const connect = deps.harness.connect
  if (!connect || !isSessionId(opts.sessionId)) return null
  const sessionId = opts.sessionId
  await ensureChatRecord(deps.db, sessionId, deps.harness.id, deps.cwd)
  const {token, resume} = await harnessToken(deps, sessionId)
  return connect.plan({
    cwd: deps.cwd,
    concivSessionId: sessionId,
    harnessSessionId: token,
    resume,
    model: opts.model ?? null,
    mcpUrl: deps.harness.capabilities.mcp === 'http' ? mcpUrlFor(deps, opts.requestUrl) : null,
    hookUrl: null,
  })
}

export async function launchHarness(deps: ChatDeps, opts: LaunchOptions): Promise<ChatLaunch> {
  if (!deps.harness.connect) return {supported: false, opened: false, command: null}
  const plan = await connectPlanFor(deps, opts)
  if (!plan) return {supported: true, opened: false, command: null}
  const {opened, command} = await executeConnectPlan(plan, {
    cwd: deps.cwd,
    stateDir: concivStateDir(deps.stateRoot),
    open: true,
  })
  return {supported: true, opened, command}
}
