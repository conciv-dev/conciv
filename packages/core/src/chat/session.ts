import {randomUUID} from 'node:crypto'
import {withoutTrailingSlash} from 'ufo'
import type {ChatCommand, ChatCommands, ChatSessionMeta} from '@conciv/protocol/chat-types'
import {isSessionId} from '@conciv/protocol/chat-types'
import type {SessionStore} from '@conciv/db'
import type {ChatRuntime} from './chat-env.js'

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

export async function sweepEmptyChatRecords(store: SessionStore): Promise<void> {
  const records = await store.list()
  for (const r of records) {
    if (r.origin === 'chat' && r.harnessSessionId === null && r.title === null) {
      await store.delete(r.id)
    }
  }
}

export type HarnessRow = {id: string; derivedTitle: string; updatedAt: number; messageCount: number}

export async function buildSessionList(args: {
  store: SessionStore
  harnessList: HarnessRow[]
  running: (sessionId: string) => boolean
  cwd: string
}): Promise<ChatSessionMeta[]> {
  const records = (await args.store.list()).filter((r) => sameCwd(r.cwd, args.cwd))
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
  deps: ChatRuntime,
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
