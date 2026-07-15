import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {writeFileSync, chmodSync} from 'node:fs'
import {platform, tmpdir} from 'node:os'
import {join} from 'node:path'
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
} from '@conciv/protocol/chat-types'
import {isSessionId, SessionRecordSchema} from '@conciv/protocol/chat-types'
import type {HarnessLaunchContext, HarnessLaunchResult} from '@conciv/protocol/harness-types'
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

export async function listCommands(deps: ChatDeps, opts: {sessionId?: string; origin: string}): Promise<ChatCommands> {
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

type Part = {type: string; content?: unknown}
type HistoryMessage = {role: string; parts: ReadonlyArray<Part>}

export function userText(message: HistoryMessage): string {
  if (message.role !== 'user') return ''
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (typeof part.content === 'string' ? part.content : ''))
    .join('\n')
}

export function settledMessages(messages: ChatHistory, pendingUserText: string | null): ChatHistory {
  if (pendingUserText === null) return messages
  const index = messages.findLastIndex((message) => {
    const text = userText(message as HistoryMessage)
    return text === pendingUserText || text.startsWith(`${pendingUserText}\n\n@`)
  })
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

export async function launchHarness(
  deps: ChatDeps,
  opts: {sessionId: string | null; model?: string; origin: string},
): Promise<ChatLaunch> {
  if (!deps.harness.launch) return {supported: false, opened: false, command: null}
  const token = opts.sessionId ? ((await sessionById(deps.db, opts.sessionId))?.harnessSessionId ?? null) : null
  const ctx: HarnessLaunchContext = {
    cwd: deps.cwd,
    sessionId: token || null,
    model: opts.model ?? null,
    mcpUrl: deps.harness.capabilities.mcp === 'http' ? `${opts.origin}/api/mcp` : null,
    openTerminal: (argv) => openTerminal(argv, deps.cwd),
    openUrl: (url) => openUrl(url),
  }
  const result = await deps.harness.launch(ctx)
  return {supported: true, opened: result.opened, command: result.command}
}

async function openTerminal(argv: string[], cwd: string): Promise<HarnessLaunchResult> {
  const command = `cd ${shellQuote(cwd)} && ${argv.map(shellQuote).join(' ')}`
  const opened = await spawnTerminal(command)
  return {opened, command}
}

async function openUrl(url: string): Promise<HarnessLaunchResult> {
  const invocation = urlOpener(url)
  const opened = invocation ? await spawnDetached(invocation[0], invocation[1]) : false
  return {opened, command: url}
}

async function spawnTerminal(command: string): Promise<boolean> {
  switch (platform()) {
    case 'darwin': {
      const file = join(tmpdir(), `conciv-launch-${randomUUID()}.command`)

      writeFileSync(file, `#!/bin/bash\n${command}\nexec $SHELL\n`)
      chmodSync(file, 0o755)
      const terminalApp = macTerminalApp(process.env.TERM_PROGRAM)
      return spawnDetached('open', terminalApp ? ['-a', terminalApp, file] : [file])
    }
    case 'win32':
      return spawnDetached('cmd', ['/c', 'start', 'cmd', '/k', command])
    case 'linux':
      return spawnDetached('x-terminal-emulator', ['-e', 'bash', '-lc', `${command}; exec bash`])
    default:
      return false
  }
}

function macTerminalApp(termProgram: string | undefined): string | null {
  switch (termProgram) {
    case 'iTerm.app':
      return 'iTerm'
    case 'Apple_Terminal':
      return 'Terminal'
    case 'WarpTerminal':
      return 'Warp'
    case 'WezTerm':
      return 'WezTerm'
    case 'ghostty':
      return 'Ghostty'
    case 'Hyper':
      return 'Hyper'
    case 'kitty':
      return 'kitty'
    default:
      return null
  }
}

function urlOpener(url: string): [string, string[]] | null {
  switch (platform()) {
    case 'darwin':
      return ['open', [url]]
    case 'win32':
      return ['cmd', ['/c', 'start', '', url]]
    case 'linux':
      return ['xdg-open', [url]]
    default:
      return null
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function spawnDetached(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {detached: true, stdio: 'ignore'})
    child.once('spawn', () => {
      child.unref()
      resolve(true)
    })
    child.once('error', () => resolve(false))
  })
}
