import {randomUUID} from 'node:crypto'
import {withoutTrailingSlash} from 'ufo'
import {type H3, HTTPError, readValidatedBody} from 'h3'
import {resolveHarnessModels} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {
  ChatSession,
  ChatModels,
  ChatSessions,
  ChatSessionMeta,
  ChatCommands,
  ChatCommand,
} from '@conciv/protocol/chat-types'
import {RenameSessionSchema, ResolveRequestSchema, isSessionId} from '@conciv/protocol/chat-types'
import type {SessionStore} from '../../store/session-store.js'
import type {TurnHub} from '../../runtime/turn-hub.js'
import {readLock, readLocks} from '../../store/lock.js'
import {readFileOrEmpty} from '../../fs.js'
import {sessionIdFromHeaders} from './session-id.js'

export type SessionRouteDeps = {
  cwd: string
  stateRoot: string
  store: SessionStore
  harness: HarnessAdapter
  hub: TurnHub
  claudeHome?: string
}

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

function nameFor(deps: SessionRouteDeps, token: string | null): string | null {
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

export function registerSessionRoutes(app: H3, deps: SessionRouteDeps): void {
  app.post('/api/chat/session/resolve', async (event) => {
    const body = await readValidatedBody(event, ResolveRequestSchema)
    return resolveSession({store: deps.store, harnessKind: deps.harness.id, cwd: deps.cwd}, body)
  })

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

  app.get('/api/chat/commands', async (event): Promise<ChatCommands> => {
    const commands = deps.harness.commands
    if (!commands) return {commands: []}
    const sessionId = sessionIdFromHeaders(event.req.headers) ?? undefined
    const origin = `http://${event.req.headers.get('host') ?? '127.0.0.1:3000'}`
    const mcpUrl = deps.harness.capabilities.mcp === 'http' ? `${origin}/api/mcp` : undefined
    const list = await commands({cwd: deps.cwd, sessionId, mcpUrl})
    return {
      commands: list.map((command) => ({
        name: command.name,
        description: command.description ?? '',
        ...(command.argumentHint ? {argumentHint: command.argumentHint} : {}),
        source: commandSource(command.name),
      })),
    }
  })

  app.get('/api/chat/history', async (event) => {
    if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
    const sessionId = sessionIdFromHeaders(event.req.headers)
    const record = sessionId ? await deps.store.get(sessionId) : null
    if (!record?.harnessSessionId) return []
    const jsonl = readFileOrEmpty(
      deps.harness.history.transcriptPath(deps.cwd, record.harnessSessionId, deps.claudeHome),
    )
    return jsonl ? deps.harness.history.parse(jsonl) : []
  })

  app.get('/api/chat/sessions', async (): Promise<ChatSessions> => {
    const hist = deps.harness.history
    const harnessList =
      deps.harness.capabilities.transcriptHistory && hist?.list ? await hist.list(deps.cwd, deps.claudeHome) : []
    const runningKeys = new Set(readLocks(deps.stateRoot).map((l) => l.key))
    const sessions = await buildSessionList({store: deps.store, harnessList, runningKeys, cwd: deps.cwd})
    return {sessions}
  })

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

  app.delete('/api/chat/session', async (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    if (!sessionId) throw new HTTPError({status: 400, message: 'no session'})
    killLock(deps.stateRoot, sessionId)
    await deps.store.delete(sessionId)
    return {ok: true}
  })

  app.post('/api/chat/stop', (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    if (sessionId) {
      deps.hub.markStopped(sessionId)
      killLock(deps.stateRoot, sessionId)
    }
    return {ok: true}
  })
}

function commandSource(name: string): ChatCommand['source'] {
  if (name.startsWith('mcp__')) return 'mcp'
  if (name.includes(':')) return 'plugin'
  return 'harness'
}
