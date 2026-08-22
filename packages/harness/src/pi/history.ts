import {readdirSync} from 'node:fs'
import {readdir, readFile, stat} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join, resolve} from 'node:path'
import {z} from 'zod'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {MessagePart, UIMessage} from '@conciv/protocol/chat-types'
import type {HarnessHistory, HarnessSessionMeta, TranscriptHandle} from '@conciv/protocol/harness-types'
import {parseJsonOrNull} from '@conciv/harness-init/json'
import {containedPath} from '../_shared/contained-path.js'
import {makeJsonlHandle, transcriptFailure} from '../_shared/jsonl-handle.js'

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

function records(raw: string): unknown[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseJsonOrNull)
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

function spokenMessage(raw: unknown): {role: 'user' | 'assistant'; parts: MessagePart[]} | null {
  const user = UserMessageSchema.safeParse(raw)
  if (user.success) return {role: 'user', parts: partsFrom(user.data.content)}
  const assistant = AssistantMessageSchema.safeParse(raw)
  if (assistant.success) return {role: 'assistant', parts: partsFrom(assistant.data.content)}
  return null
}

function toolResultPart(raw: unknown): MessagePart | null {
  const result = ToolResultMessageSchema.safeParse(raw)
  if (!result.success) return null
  return {
    type: 'tool-result',
    toolCallId: result.data.toolCallId,
    content: blockText(result.data.content),
    state: result.data.isError ? 'error' : 'complete',
  }
}

type PiFold = {entries: Entry[]}

function emptyFold(): PiFold {
  return {entries: []}
}

function foldLine(state: PiFold, line: string): PiFold {
  const trimmed = line.trim()
  if (!trimmed) return state
  const record = parseJsonOrNull(trimmed)
  if (record === null) return state
  const parsed = EntrySchema.safeParse(record)
  if (parsed.success) state.entries.push(parsed.data)
  return state
}

function messagesOf(entries: Entry[]): UIMessage[] {
  const out: UIMessage[] = []
  const idState = {n: 0}
  const open = (role: 'user' | 'assistant', parts: MessagePart[]): void => {
    idState.n += 1
    out.push({id: `h${idState.n}`, role, parts})
  }

  for (const entry of activePath(entries)) {
    const spoken = spokenMessage(entry.message)
    if (spoken) {
      if (spoken.parts.length > 0) open(spoken.role, spoken.parts)
      continue
    }
    const part = toolResultPart(entry.message)
    if (!part) continue
    const owner = out.findLast((message) => message.role === 'assistant')
    if (owner) owner.parts.push(part)
    else open('assistant', [part])
  }
  return out
}

function parseHistory(raw: string): UIMessage[] {
  return messagesOf(entriesOf(raw))
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

function sessionIdToken(fileName: string): string {
  const stem = fileName.replace(/\.jsonl$/, '')
  const separator = stem.indexOf('_')
  return separator === -1 ? stem : stem.slice(separator + 1)
}

export function sessionIdFromFile(fileName: string): HarnessSessionId {
  return HarnessSessionId.parse(sessionIdToken(fileName))
}

function namesIn(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function transcriptRoot(cwd: string, home: string = homedir()): string {
  return sessionsDir(cwd, home)
}

function transcriptPath(cwd: string, sessionId: string, home: string = homedir()): string {
  const dir = sessionsDir(cwd, home)
  const suffix = `_${sessionId}.jsonl`
  return join(dir, namesIn(dir).find((name) => name.endsWith(suffix)) ?? `${sessionId}.jsonl`)
}

function containedTranscript(cwd: string, sessionId: string, home?: string): string | null {
  return containedPath(transcriptRoot(cwd, home), transcriptPath(cwd, sessionId, home))
}

async function transcriptMessages(cwd: string, sessionId: string, home?: string): Promise<UIMessage[]> {
  const path = containedTranscript(cwd, sessionId, home)
  if (path === null) return []
  const raw = await readFile(path, 'utf8').catch(() => '')
  return raw ? parseHistory(raw) : []
}

function observeTranscript(cwd: string, sessionId: string, home?: string): TranscriptHandle {
  return makeJsonlHandle<PiFold>({
    parser: {empty: emptyFold, foldLine, messages: (state) => messagesOf(state.entries)},
    resolvePath: async () => {
      const dir = sessionsDir(cwd, home)
      const names = await readdir(dir).catch(() => [])
      const found = names.find((name) => name.endsWith(`_${sessionId}.jsonl`))
      const contained = found ? containedPath(dir, join(dir, found)) : null
      if (contained) return contained
      return transcriptFailure('missing', `no pi transcript for ${sessionId} in ${dir}`)
    },
  })
}

function firstUserText(messages: UIMessage[]): string {
  const first = messages.find((message) => message.role === 'user')
  return first ? textOf(first) : ''
}

function lastText(messages: UIMessage[]): string | null {
  const last = messages.at(-1)
  return last ? condense(textOf(last), MAX_PREVIEW) || null : null
}

function startedAt(timestamp: string | undefined): number | undefined {
  const parsed = timestamp ? Date.parse(timestamp) : NaN
  return Number.isNaN(parsed) ? undefined : parsed
}

function sessionMeta(id: HarnessSessionId, raw: string, mtimeMs: number): HarnessSessionMeta {
  const header = headerOf(raw)
  const messages = parseHistory(raw)
  return {
    id,
    derivedTitle: condense(sessionName(raw) ?? firstUserText(messages), MAX_TITLE),
    updatedAt: Math.round(mtimeMs),
    messageCount: messages.length,
    model: sessionModel(raw),
    lastMessage: lastText(messages),
    createdAt: startedAt(header?.timestamp),
  }
}

async function listSessions(cwd: string, home: string = homedir()): Promise<HarnessSessionMeta[]> {
  const dir = sessionsDir(cwd, home)
  const names = await readdir(dir).catch(() => [])
  const identified = names.flatMap((name) => {
    if (!name.endsWith('.jsonl')) return []
    const parsed = HarnessSessionId.safeParse(sessionIdToken(name))
    return parsed.success ? [{name, id: parsed.data}] : []
  })
  const stamped = (
    await Promise.all(
      identified.map(async (entry) => {
        const info = await stat(join(dir, entry.name)).catch(() => null)
        return info ? {...entry, mtimeMs: info.mtimeMs} : null
      }),
    )
  ).filter((entry) => entry !== null)
  const top = stamped.toSorted((a, b) => b.mtimeMs - a.mtimeMs).slice(0, MAX_SESSIONS)
  return Promise.all(
    top.map(async (file) => {
      const raw = await readFile(join(dir, file.name), 'utf8').catch(() => '')
      return sessionMeta(file.id, raw, file.mtimeMs)
    }),
  )
}

export const piHistory: HarnessHistory = {
  messages: transcriptMessages,
  observe: observeTranscript,
  transcriptPath,
  transcriptRoot,
  list: listSessions,
}
