import {join} from 'node:path'
import {z} from 'zod'
import type {ChatPart, ChatMessage} from '@conciv/protocol/chat-message-types'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {
  HarnessHistory,
  HarnessListPage,
  HarnessListScope,
  HarnessSessionMeta,
  HarnessSessionPage,
  TranscriptPage,
  TranscriptTailOptions,
} from '@conciv/protocol/harness-types'
import type {SDKSessionInfo} from '@anthropic-ai/claude-agent-sdk'
import {parseJsonOrNull} from '@conciv/harness-init/json'
import {containedPath} from '../_shared/contained-path.js'
import {realpathOrSelf} from '../_shared/cwd.js'
import {pageAfter} from '../_shared/page.js'
import {whenMissing} from '../_shared/when-missing.js'
import {foldJsonlFile} from '../_shared/fold-jsonl-file.js'
import {tailLines} from '../_shared/tail-lines.js'
import {CLAUDE_CONNECT_MCP_SERVER, CLAUDE_CONNECT_PLUGIN} from '@conciv/harness-init/claude/names'
import {loadClaudeAgentSdk} from './sdk.js'

const TextBlock = z.object({type: z.literal('text'), text: z.string()})
const ThinkingBlock = z.object({type: z.literal('thinking'), thinking: z.string()})
const ToolUseBlock = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.unknown().optional(),
})
const ToolResultBlock = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.unknown().optional(),
  is_error: z.boolean().optional(),
})

const CONCIV_MCP_PREFIXES = [
  `mcp__${CLAUDE_CONNECT_MCP_SERVER}__`,
  `mcp__plugin_${CLAUDE_CONNECT_PLUGIN}_${CLAUDE_CONNECT_MCP_SERVER}__`,
]

function canonicalToolName(name: string): string {
  const prefix = CONCIV_MCP_PREFIXES.find((candidate) => name.startsWith(candidate))
  return prefix === undefined ? name : name.slice(prefix.length)
}

const TextContentPart = z.object({type: z.literal('text'), text: z.string()})
function contentText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    const texts = raw.flatMap((p) => {
      const part = TextContentPart.safeParse(p)
      return part.success ? [part.data.text] : []
    })
    if (texts.length > 0) return texts.join('\n')
  }
  return JSON.stringify(raw ?? '')
}

function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export function transcriptRoot(configDir: string, cwd: string): string {
  return join(configDir, 'projects', encodeProjectDir(realpathOrSelf(cwd)))
}

export function transcriptPath(configDir: string, cwd: string, sessionId: string): string {
  return join(transcriptRoot(configDir, cwd), `${sessionId}.jsonl`)
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
    uuid: z.string().optional(),
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

function textPart(block: unknown): ChatPart | null {
  const text = TextBlock.safeParse(block)
  if (!text.success) return null
  return {type: 'text', content: text.data.text}
}

function thinkingPart(block: unknown): ChatPart | null {
  const thinking = ThinkingBlock.safeParse(block)
  if (!thinking.success) return null
  return {type: 'thinking', content: thinking.data.thinking}
}

function toolCallPart(block: unknown): ChatPart | null {
  const tool = ToolUseBlock.safeParse(block)
  if (!tool.success) return null
  return {
    type: 'tool-call',
    id: tool.data.id,
    name: canonicalToolName(tool.data.name),
    arguments: JSON.stringify(tool.data.input ?? {}),
    state: 'input-complete',
  }
}

function toolResultPart(block: unknown): ChatPart | null {
  const result = ToolResultBlock.safeParse(block)
  if (!result.success) return null
  return {
    type: 'tool-result',
    toolCallId: result.data.tool_use_id,
    content: contentText(result.data.content),
    state: result.data.is_error ? 'error' : 'complete',
  }
}

const BLOCK_READERS = [textPart, thinkingPart, toolCallPart, toolResultPart]

function blockParts(block: unknown): ChatPart[] {
  for (const read of BLOCK_READERS) {
    const part = read(block)
    if (part) return [part]
  }
  return []
}

function partsFrom(content: unknown): ChatPart[] {
  if (typeof content === 'string') return content ? [{type: 'text', content}] : []
  if (!Array.isArray(content)) return []
  return content.flatMap(blockParts)
}

function readText(parts: ChatPart[]): string {
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => ('content' in p ? p.content : ''))
    .join('\n')
}

function isInternal(parts: ChatPart[]): boolean {
  const text = readText(parts)
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

function humanMessageParts(record: TranscriptRecord, parts: ChatPart[]): ChatPart[] | null {
  if (isFromMachinery(record)) return null
  const spoken = parts.filter((p) => p.type !== 'tool-result')
  if (spoken.length === 0 || isInternal(spoken) || isSyntheticText(readText(spoken))) return null
  return spoken
}

function firstText(parts: ChatPart[]): string | null {
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
  messages: ChatMessage[]
  openAssistantId: string | null
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

function foldPreview(state: ClaudeFold, spoken: ChatPart[] | null, fromUser: boolean): void {
  if (!spoken || isInternal(spoken)) return
  const text = firstText(spoken)
  if (text === null) return
  if (fromUser && state.title === null) state.title = condense(text, MAX_TITLE)
  state.lastText = condense(text, MAX_PREVIEW)
}

function pushMessage(state: ClaudeFold, role: 'user' | 'assistant', parts: ChatPart[], nativeId: string): void {
  state.messages.push({id: nativeId, role, parts})
}

function foldUserTurn(state: ClaudeFold, parts: ChatPart[], human: ChatPart[] | null, nativeId: string): void {
  const results = parts.filter((p) => p.type === 'tool-result')
  const lastAssistant = state.messages.findLast((m) => m.role === 'assistant')
  if (lastAssistant) lastAssistant.parts.push(...results)
  if (!human) return
  state.openAssistantId = null
  pushMessage(state, 'user', human, nativeId)
}

function foldAssistantTurn(state: ClaudeFold, claudeId: string | undefined, parts: ChatPart[], nativeId: string): void {
  const open = state.messages.at(-1)
  if (claudeId && claudeId === state.openAssistantId && open?.role === 'assistant') {
    open.parts.push(...parts)
    return
  }
  state.openAssistantId = claudeId ?? null
  pushMessage(state, 'assistant', parts, nativeId)
}

function foldUserRecord(state: ClaudeFold, record: TranscriptRecord, offset: number): void {
  const parts = partsFrom(record.message?.content)
  const human = humanMessageParts(record, parts)
  foldPreview(state, human, true)
  if (parts.length === 0 || isInternal(parts)) return
  foldUserTurn(state, parts, human, record.uuid ?? `o${offset}`)
}

function foldAssistantRecord(state: ClaudeFold, record: TranscriptRecord, offset: number): void {
  const parts = partsFrom(record.message?.content)
  foldPreview(state, parts, false)
  if (parts.length === 0 || isInternal(parts)) return
  foldAssistantTurn(state, record.message?.id, parts, record.uuid ?? `o${offset}`)
}

function foldRecord(state: ClaudeFold, record: TranscriptRecord, offset: number): void {
  if (record.type === 'user') {
    foldUserRecord(state, record, offset)
    return
  }
  if (record.type === 'assistant') foldAssistantRecord(state, record, offset)
}

function conversationRecord(raw: unknown): TranscriptRecord | null {
  const parsed = TranscriptRecordSchema.safeParse(raw)
  if (!parsed.success || parsed.data.isSidechain === true) return null
  return parsed.data
}

function foldLine(state: ClaudeFold, line: string, offset: number): ClaudeFold {
  const trimmed = line.trim()
  if (!trimmed) return state
  const raw = parseJsonOrNull(trimmed)
  if (raw === null) return state
  const parsed = TranscriptRecordSchema.safeParse(raw)
  if (parsed.success && parsed.data.isSidechain === true) return state
  foldFacts(state, raw)
  if (parsed.success) foldRecord(state, parsed.data, offset)
  return state
}

function foldTranscript(jsonl: string): ClaudeFold {
  const folded = {state: emptyFold(), offset: 0}
  for (const line of jsonl.split('\n')) {
    folded.state = foldLine(folded.state, line, folded.offset)
    folded.offset += Buffer.byteLength(line) + 1
  }
  return folded.state
}

export function parseHistory(jsonl: string): ChatMessage[] {
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

type AssistantUsage = NonNullable<NonNullable<z.infer<typeof AssistantUsageRecordSchema>['message']>['usage']>

function lastAssistantUsage(jsonl: string): AssistantUsage | undefined {
  return jsonl.split('\n').reduceRight<AssistantUsage | undefined>((found, line) => {
    if (found) return found
    const rec = AssistantUsageRecordSchema.safeParse(parseJsonOrNull(line))
    return rec.success && !rec.data.isSidechain && rec.data.message?.usage ? rec.data.message.usage : found
  }, undefined)
}

export function contextTokensFromTranscript(jsonl: string): number | undefined {
  const usage = lastAssistantUsage(jsonl)
  if (!usage) return undefined
  return (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
}

function metaFromFold(id: string, cwd: string, state: ClaudeFold, mtime: number, jsonl: string): HarnessSessionMeta {
  return {
    id: HarnessSessionId.parse(id),
    cwd,
    derivedTitle: state.title ?? '',
    updatedAt: Math.round(mtime),
    sizeBytes: Buffer.byteLength(jsonl),
    model: state.model,
    totalTokens: state.totalTokens,
    lastMessage: state.lastText,
    createdAt: state.createdAt,
  }
}

export function parseSessionMeta(id: string, cwd: string, jsonl: string, mtime: number): HarnessSessionMeta {
  return metaFromFold(id, cwd, foldTranscript(jsonl), mtime, jsonl)
}

async function listSessions(scope: HarnessListScope, page: HarnessListPage): Promise<HarnessSessionPage> {
  const projectCwd = 'cwd' in scope ? scope.cwd : null
  const {listSessions: listSdkSessions} = await loadClaudeAgentSdk()
  const listed = await listSdkSessions(projectCwd === null ? {} : {dir: projectCwd, includeWorktrees: false})
  const metas = listed.flatMap((info) => metaOfInfo(info, projectCwd))
  const paged = pageAfter(metas, page, (meta) => ({updatedAt: meta.updatedAt, id: meta.id}))
  return {sessions: paged.items, next: paged.next}
}

function metaOfInfo(info: SDKSessionInfo, projectCwd: string | null): HarnessSessionMeta[] {
  const id = HarnessSessionId.safeParse(info.sessionId)
  const cwd = info.cwd ?? projectCwd
  if (!id.success || cwd === null) return []
  return [
    {
      id: id.data,
      cwd,
      derivedTitle: condense(info.summary, MAX_TITLE),
      updatedAt: info.lastModified,
      sizeBytes: info.fileSize,
      createdAt: info.createdAt,
    },
  ]
}

export async function sessionMeta(
  configDir: string,
  cwd: string,
  sessionId: string,
): Promise<HarnessSessionMeta | null> {
  if (!withinProject(configDir, cwd, sessionId)) return null
  const {getSessionInfo} = await loadClaudeAgentSdk()
  const info = await getSessionInfo(sessionId, {dir: cwd})
  return info === undefined ? null : (metaOfInfo(info, cwd).at(0) ?? null)
}

export function withinProject(configDir: string, cwd: string, sessionId: string): boolean {
  return containedPath(transcriptRoot(configDir, cwd), transcriptPath(configDir, cwd, sessionId)) !== null
}

async function transcriptMessages(
  configDir: string,
  cwd: string,
  sessionId: string,
  options: {signal?: AbortSignal} = {},
): Promise<ChatMessage[]> {
  if (!withinProject(configDir, cwd, sessionId)) return []
  const folded = await foldJsonlFile(transcriptPath(configDir, cwd, sessionId), emptyFold(), foldLine, options).catch(
    whenMissing(null),
  )
  return folded === null ? [] : folded.messages
}

type TurnLine = {line: string; offset: number; human: boolean; results: boolean; assistant: boolean}

function turnLine(line: string, offset: number): TurnLine | null {
  const record = conversationRecord(parseJsonOrNull(line.trim()))
  if (record === null || (record.type !== 'user' && record.type !== 'assistant')) return null
  const parts = partsFrom(record.message?.content)
  if (parts.length === 0 || isInternal(parts)) return null
  if (record.type === 'assistant') return {line, offset, human: false, results: false, assistant: true}
  const results = parts.some((part) => part.type === 'tool-result')
  return {line, offset, human: humanMessageParts(record, parts) !== null, results, assistant: false}
}

function turnScanner(): (line: string, offset: number) => {line: TurnLine; boundary: boolean; first: false} | null {
  const later = {orphanResults: false}
  return (line, offset) => {
    const turn = turnLine(line, offset)
    if (turn === null) return null
    const boundary = turn.human && !turn.results && !later.orphanResults
    if (turn.assistant) later.orphanResults = false
    if (turn.results) later.orphanResults = true
    return {line: turn, boundary, first: false}
  }
}

const ByteCursorSchema = z.string().regex(/^\d+$/).transform(Number)

async function transcriptTail(
  configDir: string,
  cwd: string,
  sessionId: string,
  options: TranscriptTailOptions,
): Promise<TranscriptPage> {
  const end = options.before === null ? null : ByteCursorSchema.safeParse(options.before)
  if (!withinProject(configDir, cwd, sessionId) || end?.success === false) return {messages: [], earlier: null}
  const page = tailLines({
    path: transcriptPath(configDir, cwd, sessionId),
    end: end?.data ?? null,
    limit: options.limit,
    signal: options.signal,
    scan: turnScanner(),
    fold: (lines) => lines.reduce((state, turn) => foldLine(state, turn.line, turn.offset), emptyFold()).messages,
    cursor: (turn) => String(turn.offset),
  })
  return page.catch(whenMissing({messages: [], earlier: null}))
}

export function claudeHistory(configDir: string): HarnessHistory {
  return {
    messages: (cwd, sessionId, options) => transcriptMessages(configDir, cwd, sessionId, options),
    tail: (cwd, sessionId, options) => transcriptTail(configDir, cwd, sessionId, options),
    transcriptPath: (cwd, sessionId) => transcriptPath(configDir, cwd, sessionId),
    transcriptRoot: (cwd) => transcriptRoot(configDir, cwd),
    withinProject: (cwd, sessionId) => withinProject(configDir, cwd, sessionId),
    contextTokens: contextTokensFromTranscript,
    list: listSessions,
    meta: (cwd, sessionId) => sessionMeta(configDir, cwd, sessionId),
  }
}
