import {existsSync, readdirSync, type Dirent} from 'node:fs'
import {stat} from 'node:fs/promises'
import {join} from 'node:path'
import {DatabaseSync, type SQLInputValue} from 'node:sqlite'
import {z} from 'zod'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {ChatPart, ChatMessage} from '@conciv/protocol/chat-message-types'
import type {
  HarnessHistory,
  HarnessListPage,
  HarnessListScope,
  HarnessSessionMeta,
  HarnessSessionPage,
  TranscriptHandle,
  TranscriptPage,
  TranscriptTailOptions,
} from '@conciv/protocol/harness-types'
import {realpathOrSelf, sameCwd} from '../_shared/cwd.js'
import {containedPath} from '../_shared/contained-path.js'
import {makeJsonlHandle, transcriptFailure} from '../_shared/jsonl-handle.js'
import {pageAfter} from '../_shared/page.js'
import {whenMissing} from '../_shared/when-missing.js'
import {parseJsonOrNull} from '@conciv/harness-init/json'
import {foldJsonlFile} from '../_shared/fold-jsonl-file.js'
import {tailLines} from '../_shared/tail-lines.js'
import {readHead} from '../_shared/read-head.js'
import {codexHome} from './models.js'

const MAX_TITLE = 80
const MAX_PREVIEW = 200

export function stateDbPath(): string {
  return join(codexHome(), 'state_5.sqlite')
}

export function sessionsRoot(): string {
  return join(codexHome(), 'sessions')
}

function queryRows(dbPath: string, sql: string, params: SQLInputValue[]): unknown[] {
  if (!existsSync(dbPath)) return []
  const db = new DatabaseSync(dbPath, {readOnly: true})
  try {
    return db.prepare(sql).all(...params)
  } finally {
    db.close()
  }
}

const ThreadRowSchema = z
  .object({
    id: HarnessSessionId,
    rollout_path: z.string(),
    cwd: z.string(),
    title: z.string().nullish(),
    first_user_message: z.string().nullish(),
    preview: z.string().nullish(),
    model: z.string().nullish(),
    tokens_used: z.number().nullish(),
    created_at: z.number().nullish(),
    updated_at: z.number().nullish(),
    created_at_ms: z.number().nullish(),
    updated_at_ms: z.number().nullish(),
  })
  .loose()

type ThreadRow = z.infer<typeof ThreadRowSchema>

const THREAD_COLUMNS =
  'id, rollout_path, cwd, title, first_user_message, preview, model, tokens_used, created_at, updated_at, created_at_ms, updated_at_ms'

const UPDATED_MS =
  'cast(round(case when updated_at_ms > 0 then updated_at_ms else coalesce(updated_at, 0) * 1000 end) as integer)'

const LIST_THREADS = `select ${THREAD_COLUMNS} from threads where (? is null or cwd = ?) and archived = 0 and (? is null or (${UPDATED_MS}, id) < (?, ?)) order by ${UPDATED_MS} desc, id desc limit ?`
const THREAD_BY_ID = `select ${THREAD_COLUMNS} from threads where id = ? limit 1`
const PROJECT_THREAD = `select ${THREAD_COLUMNS} from threads where id = ? and cwd = ? limit 1`

function threadRows(dbPath: string, sql: string, params: SQLInputValue[]): ThreadRow[] {
  return queryRows(dbPath, sql, params).flatMap((row) => {
    const parsed = ThreadRowSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}

function condense(value: string | null | undefined, max: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function firstText(row: ThreadRow): string {
  return (
    condense(row.title, MAX_TITLE) || condense(row.first_user_message, MAX_TITLE) || condense(row.preview, MAX_TITLE)
  )
}

function millis(ms: number | null | undefined, seconds: number | null | undefined): number {
  if (typeof ms === 'number' && ms > 0) return Math.round(ms)
  return typeof seconds === 'number' ? Math.round(seconds * 1000) : 0
}

const EnvelopeSchema = z.object({type: z.string(), payload: z.unknown().optional()}).loose()

function payloadOf(line: string): unknown {
  try {
    const parsed = EnvelopeSchema.safeParse(JSON.parse(line))
    return parsed.success ? parsed.data.payload : null
  } catch {
    return null
  }
}

const SessionMetaPayloadSchema = z.object({cwd: z.string().optional(), session_id: z.string().optional()}).loose()
const UserMessagePayloadSchema = z.object({type: z.literal('user_message'), message: z.string()}).loose()
const AgentMessagePayloadSchema = z.object({type: z.literal('agent_message'), message: z.string()}).loose()
const FunctionCallPayloadSchema = z
  .object({
    type: z.literal('function_call'),
    name: z.string(),
    namespace: z.string().nullish(),
    arguments: z.string().optional(),
    call_id: z.string(),
  })
  .loose()
const CustomToolCallPayloadSchema = z
  .object({type: z.literal('custom_tool_call'), name: z.string(), input: z.string().optional(), call_id: z.string()})
  .loose()
const ToolOutputPayloadSchema = z
  .object({
    type: z.enum(['function_call_output', 'custom_tool_call_output']),
    call_id: z.string(),
    output: z.unknown().optional(),
  })
  .loose()
const TokenCountPayloadSchema = z
  .object({
    type: z.literal('token_count'),
    info: z
      .object({total_token_usage: z.object({total_tokens: z.number()}).loose()})
      .loose()
      .nullish(),
  })
  .loose()

export function rolloutCwd(raw: string): string | null {
  for (const line of raw.split('\n')) {
    const found = sessionMetaCwd(line)
    if (found !== undefined) return found
  }
  return null
}

function sessionMetaCwd(line: string): string | null | undefined {
  const trimmed = line.trim()
  if (!trimmed) return undefined
  const parsed = EnvelopeSchema.safeParse(parseJsonOrNull(trimmed))
  if (!parsed.success || parsed.data.type !== 'session_meta') return undefined
  const meta = SessionMetaPayloadSchema.safeParse(parsed.data.payload)
  return meta.success ? (meta.data.cwd ?? null) : null
}

function outputText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  return JSON.stringify(raw ?? '')
}

function toolName(name: string, namespace: string | null | undefined): string {
  return namespace ? `${namespace}__${name}` : name
}

function hasCall(message: ChatMessage, callId: string): boolean {
  return message.parts.some((part) => part.type === 'tool-call' && part.id === callId)
}

type SpineEvent =
  | {kind: 'user'; text: string}
  | {kind: 'assistant'; text: string}
  | {kind: 'call'; callId: string; part: ChatPart}
  | {kind: 'output'; callId: string; part: ChatPart}

function spineEvent(payload: unknown): SpineEvent | null {
  const user = UserMessagePayloadSchema.safeParse(payload)
  if (user.success) return {kind: 'user', text: user.data.message}

  const agent = AgentMessagePayloadSchema.safeParse(payload)
  if (agent.success) return {kind: 'assistant', text: agent.data.message}

  const call = FunctionCallPayloadSchema.safeParse(payload)
  if (call.success) {
    return {
      kind: 'call',
      callId: call.data.call_id,
      part: {
        type: 'tool-call',
        id: call.data.call_id,
        name: toolName(call.data.name, call.data.namespace),
        arguments: call.data.arguments ?? '{}',
        state: 'input-complete',
      },
    }
  }

  const custom = CustomToolCallPayloadSchema.safeParse(payload)
  if (custom.success) {
    return {
      kind: 'call',
      callId: custom.data.call_id,
      part: {
        type: 'tool-call',
        id: custom.data.call_id,
        name: custom.data.name,
        arguments: JSON.stringify({input: custom.data.input ?? ''}),
        state: 'input-complete',
      },
    }
  }

  const output = ToolOutputPayloadSchema.safeParse(payload)
  if (!output.success) return null
  return {
    kind: 'output',
    callId: output.data.call_id,
    part: {
      type: 'tool-result',
      toolCallId: output.data.call_id,
      content: outputText(output.data.output),
      state: 'complete',
    },
  }
}

type CodexSpine = {messages: ChatMessage[]; sessionId: string}

function openMessage(spine: CodexSpine, role: 'user' | 'assistant', parts: ChatPart[], offset: number): void {
  spine.messages.push({id: `${spine.sessionId}:o${offset}`, role, parts})
}

function appendAssistant(spine: CodexSpine, part: ChatPart, offset: number): void {
  const last = spine.messages.at(-1)
  if (last?.role === 'assistant') last.parts.push(part)
  else openMessage(spine, 'assistant', [part], offset)
}

function attachOutput(spine: CodexSpine, callId: string, part: ChatPart, offset: number): void {
  const owner = spine.messages.findLast((message) => hasCall(message, callId))
  if (owner) owner.parts.push(part)
  else appendAssistant(spine, part, offset)
}

function applyEvent(spine: CodexSpine, event: SpineEvent, offset: number): CodexSpine {
  if (event.kind === 'user') {
    if (event.text.trim()) openMessage(spine, 'user', [{type: 'text', content: event.text}], offset)
    return spine
  }
  if (event.kind === 'assistant') {
    if (event.text.trim()) appendAssistant(spine, {type: 'text', content: event.text}, offset)
    return spine
  }
  if (event.kind === 'call') {
    appendAssistant(spine, event.part, offset)
    return spine
  }
  attachOutput(spine, event.callId, event.part, offset)
  return spine
}

function emptySpine(sessionId: string): CodexSpine {
  return {messages: [], sessionId}
}

function lineEvent(line: string): SpineEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const payload = payloadOf(trimmed)
  return payload ? spineEvent(payload) : null
}

function foldLine(spine: CodexSpine, line: string, offset: number): CodexSpine {
  const event = lineEvent(line)
  return event ? applyEvent(spine, event, offset) : spine
}

function spineMessages(spine: CodexSpine): ChatMessage[] {
  return spine.messages.map((message) => ({...message, parts: [...message.parts]}))
}

function contextTokensFromTranscript(raw: string): number | undefined {
  let total: number | undefined
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parsed = TokenCountPayloadSchema.safeParse(payloadOf(trimmed))
    if (parsed.success && parsed.data.info) total = parsed.data.info.total_token_usage.total_tokens
  }
  return total
}

function rolloutEntries(): Dirent[] {
  try {
    return readdirSync(sessionsRoot(), {withFileTypes: true, recursive: true})
  } catch (error) {
    return whenMissing([])(error)
  }
}

function scanForRollout(sessionId: string): string | null {
  const suffix = `-${sessionId}.jsonl`
  const hit = rolloutEntries().find((entry) => entry.isFile() && entry.name.endsWith(suffix))
  return hit ? containedPath(codexHome(), join(hit.parentPath, hit.name)) : null
}

function persistedRollout(sessionId: string): string | null {
  try {
    const row = threadRows(stateDbPath(), THREAD_BY_ID, [sessionId]).at(0)
    return row ? containedPath(codexHome(), row.rollout_path) : null
  } catch {
    return null
  }
}

export function rolloutPath(sessionId: string): string | null {
  return persistedRollout(sessionId) ?? scanForRollout(sessionId)
}

function recordedCwd(path: string): string | null {
  try {
    return rolloutCwd(readHead(path))
  } catch (error) {
    return whenMissing(null)(error)
  }
}

function rolloutWithinProject(cwd: string, sessionId: string): boolean {
  const path = rolloutPath(sessionId)
  const found = path === null ? null : recordedCwd(path)
  return found !== null && sameCwd(found, cwd)
}

type RolloutFold = {spine: CodexSpine; cwd: string | null | undefined}

function foldRolloutLine(state: RolloutFold, line: string, offset: number): RolloutFold {
  if (state.cwd === undefined) state.cwd = sessionMetaCwd(line)
  state.spine = foldLine(state.spine, line, offset)
  return state
}

async function transcriptMessages(cwd: string, sessionId: string): Promise<ChatMessage[]> {
  const path = rolloutPath(sessionId)
  if (!path) return []
  const empty: RolloutFold = {spine: emptySpine(sessionId), cwd: undefined}
  const folded = await foldJsonlFile(path, empty, foldRolloutLine).catch(whenMissing(null))
  if (folded === null || typeof folded.cwd !== 'string' || !sameCwd(folded.cwd, cwd)) return []
  return folded.spine.messages
}

async function listSessions(scope: HarnessListScope, page: HarnessListPage): Promise<HarnessSessionPage> {
  const after = page.after
  const projectCwd = 'cwd' in scope ? realpathOrSelf(scope.cwd) : null
  const rows = threadRows(stateDbPath(), LIST_THREADS, [
    projectCwd,
    projectCwd,
    after?.updatedAt ?? null,
    after?.updatedAt ?? null,
    after?.id ?? null,
    page.limit + 1,
  ])
  const paged = pageAfter(rows, page, (row) => ({updatedAt: millis(row.updated_at_ms, row.updated_at), id: row.id}))
  const metas = await Promise.all(paged.items.map(threadMeta))
  return {sessions: metas.filter((meta) => meta !== null), next: paged.next}
}

async function threadMeta(row: ThreadRow): Promise<HarnessSessionMeta | null> {
  const path = containedPath(codexHome(), row.rollout_path)
  if (path === null) return null
  const info = await stat(path).catch(whenMissing(null))
  if (info === null) return null
  return {
    id: row.id,
    cwd: row.cwd,
    derivedTitle: firstText(row),
    updatedAt: millis(row.updated_at_ms, row.updated_at),
    sizeBytes: info.size,
    model: row.model ?? null,
    totalTokens: row.tokens_used ?? 0,
    lastMessage: condense(row.preview, MAX_PREVIEW) || null,
    createdAt: millis(row.created_at_ms, row.created_at),
  }
}

async function storedMeta(cwd: string, sessionId: string): Promise<HarnessSessionMeta | null> {
  const row = threadRows(stateDbPath(), PROJECT_THREAD, [sessionId, realpathOrSelf(cwd)]).at(0)
  return row ? threadMeta(row) : null
}

function observeTranscript(cwd: string, sessionId: string): TranscriptHandle {
  return makeJsonlHandle<CodexSpine>({
    parser: {empty: () => emptySpine(sessionId), foldLine, messages: spineMessages},
    resolvePath: async () => {
      const path = rolloutPath(sessionId)
      return path ?? transcriptFailure('missing', `no codex rollout recorded for ${sessionId}`)
    },
    verifyHead: (head) => {
      const found = rolloutCwd(head)
      if (found === null) return transcriptFailure('corrupt', `no session_meta in the head of the ${sessionId} rollout`)
      if (sameCwd(found, cwd)) return null
      return transcriptFailure('missing', `${sessionId} was recorded in ${found}, not ${cwd}`)
    },
  })
}

type EventLine = {event: SpineEvent; offset: number}

function eventScanner(): (line: string, offset: number) => {line: EventLine; boundary: boolean; first: false} | null {
  const unanswered = new Set<string>()
  return (line, offset) => {
    const event = lineEvent(line)
    if (event === null) return null
    const boundary = event.kind === 'user' && event.text.trim() !== '' && unanswered.size === 0
    if (event.kind === 'output') unanswered.add(event.callId)
    if (event.kind === 'call') unanswered.delete(event.callId)
    return {line: {event, offset}, boundary, first: false}
  }
}

const ByteCursorSchema = z.string().regex(/^\d+$/).transform(Number)

const NO_PAGE: TranscriptPage = {messages: [], earlier: null}

async function rolloutTail(
  path: string,
  cwd: string,
  sessionId: string,
  options: TranscriptTailOptions,
  end: number | null,
) {
  const found = recordedCwd(path)
  if (found === null || !sameCwd(found, cwd)) return NO_PAGE
  return tailLines({
    path,
    end,
    limit: options.limit,
    signal: options.signal,
    scan: eventScanner(),
    fold: (lines) =>
      lines.reduce((spine, line) => applyEvent(spine, line.event, line.offset), emptySpine(sessionId)).messages,
    cursor: (line) => String(line.offset),
  })
}

async function transcriptTail(cwd: string, sessionId: string, options: TranscriptTailOptions): Promise<TranscriptPage> {
  const end = options.before === null ? null : ByteCursorSchema.safeParse(options.before)
  const path = rolloutPath(sessionId)
  if (path === null || end?.success === false) return NO_PAGE
  return rolloutTail(path, cwd, sessionId, options, end?.data ?? null).catch(whenMissing(NO_PAGE))
}

export const codexHistory: HarnessHistory = {
  messages: transcriptMessages,
  tail: transcriptTail,
  observe: observeTranscript,
  withinProject: rolloutWithinProject,
  contextTokens: contextTokensFromTranscript,
  list: listSessions,
  meta: storedMeta,
}
