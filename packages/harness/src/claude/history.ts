import {readdir, stat, readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join, resolve, sep} from 'node:path'
import {z} from 'zod'
import type {MessagePart, UIMessage} from '@conciv/protocol/chat-types'
import type {
  HarnessHistory,
  HarnessSessionMeta,
  HarnessSessionSummary,
  TranscriptHandle,
} from '@conciv/protocol/harness-types'
import {makeJsonlHandle} from '../_shared/jsonl-handle.js'
import {TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock, canonicalToolName, contentText} from './blocks.js'

export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export function transcriptPath(cwd: string, sessionId: string, home: string = homedir()): string {
  return join(home, '.claude', 'projects', encodeProjectDir(cwd), `${sessionId}.jsonl`)
}

const INTERNAL_MARKERS = ['VIBE_PROGRESS_TICK', 'NEEDS_INFO:', '<system-reminder>']

const SYNTHETIC_MARKERS = [
  '[Request interrupted by user]',
  '[Request interrupted by user for tool use]',
  'No response requested.',
]

const MACHINERY_XML_BLOCK = /<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\n?/g

const OriginSchema = z.object({kind: z.string()}).loose()

const TranscriptRecordSchema = z
  .object({
    type: z.string(),
    isSidechain: z.boolean().optional(),
    isMeta: z.boolean().optional(),
    isCompactSummary: z.boolean().optional(),
    interruptedMessageId: z.string().optional(),
    origin: z.unknown().optional(),
    message: z
      .object({id: z.string().optional(), content: z.union([z.string(), z.array(z.unknown())]).optional()})
      .loose()
      .optional(),
  })
  .loose()

type TranscriptRecord = z.infer<typeof TranscriptRecordSchema>

function partsFrom(content: unknown): MessagePart[] {
  if (typeof content === 'string') return content ? [{type: 'text', content}] : []
  if (!Array.isArray(content)) return []
  const out: MessagePart[] = []
  for (const part of content) {
    const text = TextBlock.safeParse(part)
    if (text.success) {
      out.push({type: 'text', content: text.data.text})
      continue
    }
    const thinking = ThinkingBlock.safeParse(part)
    if (thinking.success) {
      out.push({type: 'thinking', content: thinking.data.thinking})
      continue
    }
    const tool = ToolUseBlock.safeParse(part)
    if (tool.success) {
      out.push({
        type: 'tool-call',
        id: tool.data.id,
        name: canonicalToolName(tool.data.name),
        arguments: JSON.stringify(tool.data.input ?? {}),
        state: 'input-complete',
      })
      continue
    }

    const result = ToolResultBlock.safeParse(part)
    if (result.success) {
      out.push({
        type: 'tool-result',
        toolCallId: result.data.tool_use_id,
        content: contentText(result.data.content),
        state: result.data.is_error ? 'error' : 'complete',
      })
    }
  }
  return out
}

function textOf(parts: MessagePart[]): string {
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => ('content' in p ? p.content : ''))
    .join('\n')
}

function isInternal(parts: MessagePart[]): boolean {
  const text = textOf(parts)
  return INTERNAL_MARKERS.some((m) => text.includes(m))
}

function isSyntheticText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (SYNTHETIC_MARKERS.includes(trimmed)) return true
  return trimmed.replace(MACHINERY_XML_BLOCK, '').trim() === ''
}

function isFromMachinery(record: TranscriptRecord): boolean {
  if (record.isMeta === true || record.isCompactSummary === true) return true
  if (record.interruptedMessageId !== undefined) return true
  const origin = OriginSchema.safeParse(record.origin)
  return origin.success && origin.data.kind !== 'human'
}

function humanMessageParts(record: TranscriptRecord, parts: MessagePart[]): MessagePart[] | null {
  if (isFromMachinery(record)) return null
  const spoken = parts.filter((p) => p.type !== 'tool-result')
  if (spoken.length === 0 || isInternal(spoken) || isSyntheticText(textOf(spoken))) return null
  return spoken
}

function firstText(parts: MessagePart[]): string | null {
  const text = parts.find((p) => p.type === 'text')
  if (!text || text.type !== 'text' || typeof text.content !== 'string') return null
  return text.content
}

const MAX_TITLE = 80
const MAX_PREVIEW = 200

const SystemRecordSchema = z.object({type: z.literal('system'), model: z.string().optional()}).loose()
const ResultRecordSchema = z
  .object({
    type: z.literal('result'),
    usage: z.object({input_tokens: z.number().optional(), output_tokens: z.number().optional()}).loose().optional(),
  })
  .loose()
const StampedRecordSchema = z.object({timestamp: z.string().optional()}).loose()

type ClaudeFold = {
  messages: UIMessage[]
  openAssistantId: string | null
  count: number
  title: string | null
  lastText: string | null
  model: string | null
  totalTokens: number
  createdAt: number | undefined
}

function emptyFold(): ClaudeFold {
  return {
    messages: [],
    openAssistantId: null,
    count: 0,
    title: null,
    lastText: null,
    model: null,
    totalTokens: 0,
    createdAt: undefined,
  }
}

function condense(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

function foldModel(state: ClaudeFold, record: unknown): void {
  const system = SystemRecordSchema.safeParse(record)
  if (system.success && system.data.model) state.model = system.data.model
}

function foldTokens(state: ClaudeFold, record: unknown): void {
  const result = ResultRecordSchema.safeParse(record)
  if (!result.success || !result.data.usage) return
  state.totalTokens += (result.data.usage.input_tokens ?? 0) + (result.data.usage.output_tokens ?? 0)
}

function foldCreatedAt(state: ClaudeFold, record: unknown): void {
  if (state.createdAt !== undefined) return
  const stamped = StampedRecordSchema.safeParse(record)
  const ms = stamped.success && stamped.data.timestamp ? Date.parse(stamped.data.timestamp) : NaN
  if (!Number.isNaN(ms)) state.createdAt = ms
}

function foldFacts(state: ClaudeFold, record: unknown): void {
  foldModel(state, record)
  foldTokens(state, record)
  foldCreatedAt(state, record)
}

function foldPreview(state: ClaudeFold, spoken: MessagePart[] | null, fromUser: boolean): void {
  if (!spoken || isInternal(spoken)) return
  const text = firstText(spoken)
  if (text === null) return
  if (fromUser && state.title === null) state.title = condense(text, MAX_TITLE)
  state.lastText = condense(text, MAX_PREVIEW)
}

function pushMessage(state: ClaudeFold, role: 'user' | 'assistant', parts: MessagePart[]): void {
  state.count += 1
  state.messages.push({id: `h${state.count}`, role, parts})
}

function foldUserTurn(state: ClaudeFold, parts: MessagePart[], human: MessagePart[] | null): void {
  const results = parts.filter((p) => p.type === 'tool-result')
  const lastAssistant = state.messages.findLast((m) => m.role === 'assistant')
  if (lastAssistant) lastAssistant.parts.push(...results)
  if (!human) return
  state.openAssistantId = null
  pushMessage(state, 'user', human)
}

function foldAssistantTurn(state: ClaudeFold, claudeId: string | undefined, parts: MessagePart[]): void {
  const open = state.messages.at(-1)
  if (claudeId && claudeId === state.openAssistantId && open?.role === 'assistant') {
    open.parts.push(...parts)
    return
  }
  state.openAssistantId = claudeId ?? null
  pushMessage(state, 'assistant', parts)
}

function foldUserRecord(state: ClaudeFold, record: TranscriptRecord): void {
  const parts = partsFrom(record.message?.content)
  const human = humanMessageParts(record, parts)
  foldPreview(state, human, true)
  if (parts.length === 0 || isInternal(parts)) return
  foldUserTurn(state, parts, human)
}

function foldAssistantRecord(state: ClaudeFold, record: TranscriptRecord): void {
  const parts = partsFrom(record.message?.content)
  foldPreview(state, parts, false)
  if (parts.length === 0 || isInternal(parts)) return
  foldAssistantTurn(state, record.message?.id, parts)
}

function foldRecord(state: ClaudeFold, record: TranscriptRecord): void {
  if (record.type === 'user') {
    foldUserRecord(state, record)
    return
  }
  if (record.type === 'assistant') foldAssistantRecord(state, record)
}

function foldLine(state: ClaudeFold, line: string): ClaudeFold {
  const trimmed = line.trim()
  if (!trimmed) return state
  const raw = parseJson(trimmed)
  if (raw === null) return state
  const parsed = TranscriptRecordSchema.safeParse(raw)
  if (parsed.success && parsed.data.isSidechain === true) return state
  foldFacts(state, raw)
  if (parsed.success) foldRecord(state, parsed.data)
  return state
}

function foldTranscript(jsonl: string): ClaudeFold {
  return jsonl.split('\n').reduce(foldLine, emptyFold())
}

function foldMessages(state: ClaudeFold): UIMessage[] {
  return state.messages.map((message) => ({...message, parts: [...message.parts]}))
}

export function parseHistory(jsonl: string): UIMessage[] {
  return foldTranscript(jsonl).messages
}

const AssistantUsageRecordSchema = z
  .object({
    type: z.literal('assistant'),
    isSidechain: z.boolean().optional(),
    message: z
      .object({
        usage: z
          .object({
            input_tokens: z.number().optional(),
            cache_read_input_tokens: z.number().optional(),
            cache_creation_input_tokens: z.number().optional(),
          })
          .loose()
          .optional(),
      })
      .loose()
      .optional(),
  })
  .loose()

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

type AssistantUsage = NonNullable<NonNullable<z.infer<typeof AssistantUsageRecordSchema>['message']>['usage']>

function lastAssistantUsage(jsonl: string): AssistantUsage | undefined {
  return jsonl.split('\n').reduceRight<AssistantUsage | undefined>((found, line) => {
    if (found) return found
    const rec = AssistantUsageRecordSchema.safeParse(parseJson(line))
    return rec.success && !rec.data.isSidechain && rec.data.message?.usage ? rec.data.message.usage : found
  }, undefined)
}

export function contextTokensFromTranscript(jsonl: string): number | undefined {
  const usage = lastAssistantUsage(jsonl)
  if (!usage) return undefined
  return (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
}

const SummaryRecordSchema = z.object({type: z.literal('summary'), summary: z.string()}).loose()

export function nameFromTranscript(jsonl: string): string | null {
  let name: string | null = null
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = SummaryRecordSchema.safeParse(JSON.parse(trimmed))
      if (parsed.success && parsed.data.summary) name = parsed.data.summary
    } catch {}
  }
  return name
}

function metaFromFold(id: string, state: ClaudeFold, mtime: number): HarnessSessionMeta {
  return {
    id,
    derivedTitle: state.title ?? '',
    updatedAt: Math.round(mtime),
    messageCount: state.messages.length,
    model: state.model,
    totalTokens: state.totalTokens,
    lastMessage: state.lastText,
    createdAt: state.createdAt,
  }
}

export function parseSessionMeta(id: string, jsonl: string, mtime: number): HarnessSessionMeta {
  return metaFromFold(id, foldTranscript(jsonl), mtime)
}

const MAX_SESSIONS = 50
const SUMMARY_TAIL = 12

export async function listSessions(cwd: string, home: string = homedir()): Promise<HarnessSessionMeta[]> {
  const dir = join(home, '.claude', 'projects', encodeProjectDir(cwd))
  let names: string[]
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.jsonl'))
  } catch {
    return []
  }
  const stamped = (
    await Promise.all(
      names.map(async (name) => {
        try {
          return {name, mtime: (await stat(join(dir, name))).mtimeMs}
        } catch {
          return null
        }
      }),
    )
  ).filter(Boolean) as {name: string; mtime: number}[]
  const top = stamped.toSorted((a, b) => b.mtime - a.mtime).slice(0, MAX_SESSIONS)
  return Promise.all(
    top.map(async (f) => {
      const raw = await readFile(join(dir, f.name), 'utf8').catch(() => '')
      return parseSessionMeta(f.name.replace(/\.jsonl$/, ''), raw, f.mtime)
    }),
  )
}

export async function sessionSummary(
  cwd: string,
  sessionId: string,
  home?: string,
): Promise<HarnessSessionSummary | null> {
  const path = transcriptPath(cwd, sessionId, home)
  const info = await stat(path).catch(() => null)
  if (!info) return null
  const raw = await readFile(path, 'utf8').catch(() => '')
  if (!raw) return null
  const state = foldTranscript(raw)
  return {meta: metaFromFold(sessionId, state, info.mtimeMs), tail: state.messages.slice(-SUMMARY_TAIL)}
}

export async function sessionMeta(cwd: string, sessionId: string, home?: string): Promise<HarnessSessionMeta | null> {
  return (await sessionSummary(cwd, sessionId, home))?.meta ?? null
}

function observeTranscript(cwd: string, sessionId: string, home?: string): TranscriptHandle {
  return makeJsonlHandle<ClaudeFold>({
    parser: {empty: emptyFold, foldLine, messages: foldMessages},
    resolvePath: () => Promise.resolve(transcriptPath(cwd, sessionId, home)),
  })
}

export function withinProject(cwd: string, sessionId: string, home: string = homedir()): boolean {
  const root = resolve(join(home, '.claude', 'projects', encodeProjectDir(cwd)))
  return resolve(transcriptPath(cwd, sessionId, home)).startsWith(root + sep)
}

async function transcriptMessages(cwd: string, sessionId: string, home?: string): Promise<UIMessage[]> {
  const raw = await readFile(transcriptPath(cwd, sessionId, home), 'utf8').catch(() => '')
  return raw ? parseHistory(raw) : []
}

export const claudeHistory: HarnessHistory = {
  messages: transcriptMessages,
  observe: observeTranscript,
  transcriptPath,
  withinProject,
  nameFromTranscript,
  contextTokens: contextTokensFromTranscript,
  list: listSessions,
  meta: sessionMeta,
  summary: sessionSummary,
}
