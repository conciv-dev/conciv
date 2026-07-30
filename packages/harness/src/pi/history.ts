import {readdirSync} from 'node:fs'
import {readdir, readFile, stat} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join, resolve} from 'node:path'
import {z} from 'zod'
import type {MessagePart, UIMessage} from '@conciv/protocol/chat-types'
import type {HarnessHistory, HarnessSessionMeta, TranscriptStat} from '@conciv/protocol/harness-types'

const MAX_SESSIONS = 50
const MAX_TITLE = 80
const MAX_PREVIEW = 200

export function encodeSessionDir(cwd: string): string {
  return `--${resolve(cwd)
    .replace(/^[/\\]/, '')
    .replace(/[/\\:]/g, '-')}--`
}

export function sessionsDir(cwd: string, home: string = homedir()): string {
  return join(home, '.pi', 'agent', 'sessions', encodeSessionDir(cwd))
}

const EntrySchema = z
  .object({type: z.string(), id: z.string(), parentId: z.string().nullish(), message: z.unknown().optional()})
  .loose()
const HeaderSchema = z
  .object({type: z.literal('session'), id: z.string(), timestamp: z.string().optional(), cwd: z.string().optional()})
  .loose()
const SessionInfoSchema = z.object({type: z.literal('session_info'), name: z.string()}).loose()
const ModelChangeSchema = z.object({type: z.literal('model_change'), modelId: z.string()}).loose()

type Entry = z.infer<typeof EntrySchema>

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function records(raw: string): unknown[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLine)
    .filter((value) => value !== null)
}

function entriesOf(raw: string): Entry[] {
  return records(raw).flatMap((record) => {
    const parsed = EntrySchema.safeParse(record)
    return parsed.success ? [parsed.data] : []
  })
}

export function activePath(entries: Entry[]): Entry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const chain: Entry[] = []
  const seen = new Set<string>()
  let cursor = entries.findLast((entry) => entry.type === 'message')
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    chain.push(cursor)
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
  }
  return chain.toReversed()
}

const TextContentSchema = z.object({type: z.literal('text'), text: z.string()})
const ThinkingContentSchema = z.object({type: z.literal('thinking'), thinking: z.string()})
const ToolCallContentSchema = z.object({
  type: z.literal('toolCall'),
  id: z.string(),
  name: z.string(),
  arguments: z.unknown().optional(),
})

const UserMessageSchema = z
  .object({role: z.literal('user'), content: z.union([z.string(), z.array(z.unknown())])})
  .loose()
const AssistantMessageSchema = z.object({role: z.literal('assistant'), content: z.array(z.unknown())}).loose()
const ToolResultMessageSchema = z
  .object({
    role: z.literal('toolResult'),
    toolCallId: z.string(),
    content: z.union([z.string(), z.array(z.unknown())]).optional(),
    isError: z.boolean().optional(),
  })
  .loose()

function blockText(blocks: unknown): string {
  if (typeof blocks === 'string') return blocks
  if (!Array.isArray(blocks)) return ''
  return blocks
    .flatMap((block) => {
      const text = TextContentSchema.safeParse(block)
      return text.success ? [text.data.text] : []
    })
    .join('\n')
}

function partsFrom(content: unknown): MessagePart[] {
  if (typeof content === 'string') return content ? [{type: 'text', content}] : []
  if (!Array.isArray(content)) return []
  return content.flatMap<MessagePart>((block) => {
    const text = TextContentSchema.safeParse(block)
    if (text.success) return text.data.text ? [{type: 'text', content: text.data.text}] : []
    const thinking = ThinkingContentSchema.safeParse(block)
    if (thinking.success) return [{type: 'thinking', content: thinking.data.thinking}]
    const call = ToolCallContentSchema.safeParse(block)
    if (call.success) {
      return [
        {
          type: 'tool-call',
          id: call.data.id,
          name: call.data.name,
          arguments: JSON.stringify(call.data.arguments ?? {}),
          state: 'input-complete',
        },
      ]
    }
    return []
  })
}

export function parseHistory(raw: string): UIMessage[] {
  const out: UIMessage[] = []
  const idState = {n: 0}
  const open = (role: 'user' | 'assistant', parts: MessagePart[]): void => {
    idState.n += 1
    out.push({id: `h${idState.n}`, role, parts})
  }

  for (const entry of activePath(entriesOf(raw))) {
    const user = UserMessageSchema.safeParse(entry.message)
    if (user.success) {
      const parts = partsFrom(user.data.content)
      if (parts.length > 0) open('user', parts)
      continue
    }
    const assistant = AssistantMessageSchema.safeParse(entry.message)
    if (assistant.success) {
      const parts = partsFrom(assistant.data.content)
      if (parts.length > 0) open('assistant', parts)
      continue
    }
    const result = ToolResultMessageSchema.safeParse(entry.message)
    if (!result.success) continue
    const part: MessagePart = {
      type: 'tool-result',
      toolCallId: result.data.toolCallId,
      content: blockText(result.data.content),
      state: result.data.isError ? 'error' : 'complete',
    }
    const owner = out.findLast((message) => message.role === 'assistant')
    if (owner) owner.parts.push(part)
    else open('assistant', [part])
  }
  return out
}

function condense(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function textOf(message: UIMessage): string {
  const part = message.parts.find((candidate) => candidate.type === 'text')
  return part && part.type === 'text' ? part.content : ''
}

function sessionName(raw: string): string | null {
  const names = records(raw).flatMap((record) => {
    const parsed = SessionInfoSchema.safeParse(record)
    return parsed.success ? [parsed.data.name] : []
  })
  return names.at(-1) ?? null
}

function sessionModel(raw: string): string | null {
  const models = records(raw).flatMap((record) => {
    const parsed = ModelChangeSchema.safeParse(record)
    return parsed.success ? [parsed.data.modelId] : []
  })
  return models.at(-1) ?? null
}

function headerOf(raw: string): z.infer<typeof HeaderSchema> | null {
  const first = records(raw).at(0)
  const parsed = HeaderSchema.safeParse(first)
  return parsed.success ? parsed.data : null
}

function namesIn(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

export function transcriptPath(cwd: string, sessionId: string, home: string = homedir()): string {
  const dir = sessionsDir(cwd, home)
  const suffix = `_${sessionId}.jsonl`
  return join(dir, namesIn(dir).find((name) => name.endsWith(suffix)) ?? `${sessionId}.jsonl`)
}

export async function transcriptMessages(cwd: string, sessionId: string, home?: string): Promise<UIMessage[]> {
  const raw = await readFile(transcriptPath(cwd, sessionId, home), 'utf8').catch(() => '')
  return raw ? parseHistory(raw) : []
}

export async function transcriptStat(cwd: string, sessionId: string, home?: string): Promise<TranscriptStat | null> {
  const info = await stat(transcriptPath(cwd, sessionId, home)).catch(() => null)
  return info ? {mtimeMs: info.mtimeMs, size: info.size} : null
}

function sessionMeta(fileName: string, raw: string, mtimeMs: number): HarnessSessionMeta {
  const header = headerOf(raw)
  const messages = parseHistory(raw)
  const firstUser = messages.find((message) => message.role === 'user')
  const last = messages.at(-1)
  const created = header?.timestamp ? Date.parse(header.timestamp) : NaN
  return {
    id: header?.id ?? fileName.replace(/\.jsonl$/, ''),
    derivedTitle: condense(sessionName(raw) ?? (firstUser ? textOf(firstUser) : ''), MAX_TITLE),
    updatedAt: Math.round(mtimeMs),
    messageCount: messages.length,
    model: sessionModel(raw),
    lastMessage: last ? condense(textOf(last), MAX_PREVIEW) || null : null,
    createdAt: Number.isNaN(created) ? undefined : created,
  }
}

export async function listSessions(cwd: string, home: string = homedir()): Promise<HarnessSessionMeta[]> {
  const dir = sessionsDir(cwd, home)
  const names = await readdir(dir).catch(() => [])
  const files = names.filter((name) => name.endsWith('.jsonl'))
  const stamped = (
    await Promise.all(
      files.map(async (name) => {
        const info = await stat(join(dir, name)).catch(() => null)
        return info ? {name, mtimeMs: info.mtimeMs} : null
      }),
    )
  ).filter((entry) => entry !== null)
  const top = stamped.toSorted((a, b) => b.mtimeMs - a.mtimeMs).slice(0, MAX_SESSIONS)
  return Promise.all(
    top.map(async (file) => {
      const raw = await readFile(join(dir, file.name), 'utf8').catch(() => '')
      return sessionMeta(file.name, raw, file.mtimeMs)
    }),
  )
}

export const piHistory: HarnessHistory = {
  messages: transcriptMessages,
  transcriptStat,
  transcriptPath,
  list: listSessions,
}
