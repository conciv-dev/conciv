import {randomUUID} from 'node:crypto'
import {withoutTrailingSlash} from 'ufo'
import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import {zValidator} from '@hono/zod-validator'
import {resolveHarnessModels} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {
  ChatSession,
  ChatModels,
  ChatSessions,
  ChatSessionMeta,
  ChatCommands,
  ChatCommand,
  ChatHistory,
  Ok,
  RenameResponse,
  ResolveResponse,
} from '@conciv/protocol/chat-types'
import {RenameSessionSchema, ResolveRequestSchema, isSessionId} from '@conciv/protocol/chat-types'
import type {SessionStore} from '../../store/session-store.js'
import type {ChatEnv} from './chat-env.js'
import {readLock, readLocks} from '../../store/lock.js'
import {readFileOrEmpty} from '../../fs.js'
import {sessionIdFromHeaders} from './session-id.js'

export type ResolveDeps = {
  store: SessionStore
  harnessKind: string
  cwd: string
  mintId?: () => string
}

export async function resolveSession(deps: ResolveDeps, body: {id?: string}): Promise<{sessionId: string}> {
  const mint = deps.mintId ?? (() => `conciv_${randomUUID()}`)
  if (body.id && isSessionId(body.id)) {
    const existing = await deps.store.get(body.id)
    if (existing) return {sessionId: existing.id}
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

const sameCwd = (a: string, b: string): boolean => withoutTrailingSlash(a) === withoutTrailingSlash(b)

export async function sweepEmptyChatRecords(store: SessionStore, locked: Set<string>): Promise<void> {
  const records = await store.list()
  for (const r of records) {
    if (r.origin === 'chat' && r.harnessSessionId === null && r.title === null && !locked.has(r.id)) {
      await store.delete(r.id)
    }
  }
}

export type HarnessRow = {id: string; derivedTitle: string; updatedAt: number; messageCount: number}

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
      origin: r.origin === 'external' ? 'external' : 'conciv',
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

function nameFor(deps: {cwd: string; harness: HarnessAdapter; claudeHome?: string}, token: string | null): string | null {
  const hist = deps.harness.history
  if (!token || !hist?.nameFromTranscript) return null
  const raw = readFileOrEmpty(hist.transcriptPath(deps.cwd, token, deps.claudeHome))
  return raw ? hist.nameFromTranscript(raw) : null
}

function killLock(stateRoot: string, sessionId: string): void {
  const lock = readLock(stateRoot, sessionId)
  if (!lock.pid || lock.pid === process.pid) return
  try {
    process.kill(lock.pid, 'SIGTERM')
  } catch {}
}

const app = new Hono<ChatEnv>()
  .post('/session/resolve', zValidator('json', ResolveRequestSchema), async (c) => {
    const deps = c.var.chat
    const resolved = await resolveSession(
      {store: deps.store, harnessKind: deps.harness.id, cwd: deps.cwd},
      c.req.valid('json'),
    )
    const payload: ResolveResponse = {sessionId: resolved.sessionId as ResolveResponse['sessionId']}
    return c.json(payload)
  })
  .get('/session', async (c) => {
    const deps = c.var.chat
    const sessionId = sessionIdFromHeaders(c.req.raw.headers)
    if (!sessionId) throw new HTTPException(400, {message: 'no session'})
    const harness = {
      id: deps.harness.id,
      name: deps.harness.displayName ?? deps.harness.id,
      canLaunch: Boolean(deps.harness.launch),
    }
    const record = await deps.store.get(sessionId)
    if (!record) {
      const payload: ChatSession = {
        sessionId: sessionId as ChatSession['sessionId'],
        harnessSessionId: null,
        name: null,
        origin: 'chat',
        cwd: deps.cwd,
        lock: {held: false, role: null},
        usage: null,
        harness,
      }
      return c.json(payload)
    }
    const lock = readLock(deps.stateRoot, record.id)
    const payload: ChatSession = {
      sessionId: record.id as ChatSession['sessionId'],
      harnessSessionId: record.harnessSessionId,
      name: record.title ?? nameFor(deps, record.harnessSessionId),
      origin: record.origin,
      cwd: deps.cwd,
      lock: {held: lock.held, role: lock.role},
      usage: record.usage,
      harness,
    }
    return c.json(payload)
  })
  .get('/models', async (c) => {
    const deps = c.var.chat
    const models = await resolveHarnessModels(deps.harness)
    const defaultModel = deps.harness.defaultModel ?? models[0]?.id ?? null
    const payload: ChatModels = {
      models,
      defaultModel,
      harness: {
        id: deps.harness.id,
        name: deps.harness.displayName ?? deps.harness.id,
        canLaunch: Boolean(deps.harness.launch),
      },
    }
    return c.json(payload)
  })
  .get('/commands', async (c) => {
    const deps = c.var.chat
    const commands = deps.harness.commands
    if (!commands) {
      const payload: ChatCommands = {commands: []}
      return c.json(payload)
    }
    const sessionId = sessionIdFromHeaders(c.req.raw.headers) ?? undefined
    const origin = `http://${c.req.header('host') ?? '127.0.0.1:3000'}`
    const mcpUrl = deps.harness.capabilities.mcp === 'http' ? `${origin}/api/mcp` : undefined
    const list = await commands({cwd: deps.cwd, sessionId, mcpUrl})
    const payload: ChatCommands = {
      commands: list.map((command) => ({
        name: command.name,
        description: command.description ?? '',
        ...(command.argumentHint ? {argumentHint: command.argumentHint} : {}),
        source: commandSource(command.name),
      })),
    }
    return c.json(payload)
  })
  .get('/history', async (c) => {
    const deps = c.var.chat
    const empty: ChatHistory = []
    if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return c.json(empty)
    const sessionId = sessionIdFromHeaders(c.req.raw.headers)
    const record = sessionId ? await deps.store.get(sessionId) : null
    if (!record?.harnessSessionId) return c.json(empty)
    const jsonl = readFileOrEmpty(
      deps.harness.history.transcriptPath(deps.cwd, record.harnessSessionId, deps.claudeHome),
    )
    const payload: ChatHistory = jsonl ? deps.harness.history.parse(jsonl) : []
    return c.json(payload)
  })
  .get('/sessions', async (c) => {
    const deps = c.var.chat
    const hist = deps.harness.history
    const harnessList =
      deps.harness.capabilities.transcriptHistory && hist?.list ? await hist.list(deps.cwd, deps.claudeHome) : []
    const runningKeys = new Set(readLocks(deps.stateRoot).map((l) => l.key))
    const sessions = await buildSessionList({store: deps.store, harnessList, runningKeys, cwd: deps.cwd})
    const payload: ChatSessions = {sessions}
    return c.json(payload)
  })
  .post('/sessions/title', zValidator('json', RenameSessionSchema), async (c) => {
    const deps = c.var.chat
    const {sessionId, title} = c.req.valid('json')
    const clean = title
      .replace(/\p{Cc}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
    await deps.store.update(sessionId, {title: clean})
    const payload: RenameResponse = {ok: true, title: clean}
    return c.json(payload)
  })
  .delete('/session', async (c) => {
    const deps = c.var.chat
    const sessionId = sessionIdFromHeaders(c.req.raw.headers)
    if (!sessionId) throw new HTTPException(400, {message: 'no session'})
    killLock(deps.stateRoot, sessionId)
    await deps.store.delete(sessionId)
    const payload: Ok = {ok: true}
    return c.json(payload)
  })
  .post('/stop', (c) => {
    const deps = c.var.chat
    const sessionId = sessionIdFromHeaders(c.req.raw.headers)
    if (sessionId) {
      deps.hub.markStopped(sessionId)
      killLock(deps.stateRoot, sessionId)
    }
    const payload: Ok = {ok: true}
    return c.json(payload)
  })

export default app

function commandSource(name: string): ChatCommand['source'] {
  if (name.startsWith('mcp__')) return 'mcp'
  if (name.includes(':')) return 'plugin'
  return 'harness'
}
