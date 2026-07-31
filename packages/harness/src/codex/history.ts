import {readdir, readFile, stat} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {z} from 'zod'
import type {MessagePart, UIMessage} from '@conciv/protocol/chat-types'
import type {HarnessHistory, HarnessSessionMeta, TranscriptHandle, TranscriptStat} from '@conciv/protocol/harness-types'
import {makeJsonlHandle, transcriptFailure} from '../_shared/jsonl-handle.js'

const MAX_SESSIONS = 50
const MAX_TITLE = 80
const MAX_PREVIEW = 200

export function stateDbPath(home: string = homedir()): string {
  return join(home, '.codex', 'state_5.sqlite')
}

export function sessionsRoot(home: string = homedir()): string {
  return join(home, '.codex', 'sessions')
}

function queryRows(dbPath: string, sql: string, params: string[]): unknown[] {
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(dbPath, {readOnly: true})
    return db.prepare(sql).all(...params)
  } catch {
    return []
  } finally {
    db?.close()
  }
}

const ThreadRowSchema = z
  .object({
    id: z.string(),
    rollout_path: z.string(),
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
  'id, rollout_path, title, first_user_message, preview, model, tokens_used, created_at, updated_at, created_at_ms, updated_at_ms'

const LIST_THREADS = `select ${THREAD_COLUMNS} from threads where cwd = ? and archived = 0 order by coalesce(updated_at_ms, updated_at * 1000) desc limit ${MAX_SESSIONS}`
const THREAD_BY_ID = `select ${THREAD_COLUMNS} from threads where id = ? limit 1`

function threadRows(dbPath: string, sql: string, params: string[]): ThreadRow[] {
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
    const trimmed = line.trim()
    if (!trimmed) continue
    let envelope: unknown
    try {
      envelope = JSON.parse(trimmed)
    } catch {
      continue
    }
    const parsed = EnvelopeSchema.safeParse(envelope)
    if (!parsed.success || parsed.data.type !== 'session_meta') continue
    const meta = SessionMetaPayloadSchema.safeParse(parsed.data.payload)
    return meta.success ? (meta.data.cwd ?? null) : null
  }
  return null
}

function outputText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  return JSON.stringify(raw ?? '')
}

function toolName(name: string, namespace: string | null | undefined): string {
  return namespace ? `${namespace}__${name}` : name
}

function hasCall(message: UIMessage, callId: string): boolean {
  return message.parts.some((part) => part.type === 'tool-call' && part.id === callId)
}

type SpineEvent =
  | {kind: 'user'; text: string}
  | {kind: 'assistant'; text: string}
  | {kind: 'call'; part: MessagePart}
  | {kind: 'output'; callId: string; part: MessagePart}

function spineEvent(payload: unknown): SpineEvent | null {
  const user = UserMessagePayloadSchema.safeParse(payload)
  if (user.success) return {kind: 'user', text: user.data.message}

  const agent = AgentMessagePayloadSchema.safeParse(payload)
  if (agent.success) return {kind: 'assistant', text: agent.data.message}

  const call = FunctionCallPayloadSchema.safeParse(payload)
  if (call.success) {
    return {
      kind: 'call',
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

type CodexSpine = {messages: UIMessage[]; opened: number}

function openMessage(spine: CodexSpine, role: 'user' | 'assistant', parts: MessagePart[]): void {
  spine.opened += 1
  spine.messages.push({id: `h${spine.opened}`, role, parts})
}

function appendAssistant(spine: CodexSpine, part: MessagePart): void {
  const last = spine.messages.at(-1)
  if (last?.role === 'assistant') last.parts.push(part)
  else openMessage(spine, 'assistant', [part])
}

function attachOutput(spine: CodexSpine, callId: string, part: MessagePart): void {
  const owner = spine.messages.findLast((message) => hasCall(message, callId))
  if (owner) owner.parts.push(part)
  else appendAssistant(spine, part)
}

function applyEvent(spine: CodexSpine, event: SpineEvent): void {
  if (event.kind === 'user') {
    if (event.text.trim()) openMessage(spine, 'user', [{type: 'text', content: event.text}])
    return
  }
  if (event.kind === 'assistant') {
    if (event.text.trim()) appendAssistant(spine, {type: 'text', content: event.text})
    return
  }
  if (event.kind === 'call') {
    appendAssistant(spine, event.part)
    return
  }
  attachOutput(spine, event.callId, event.part)
}

function emptySpine(): CodexSpine {
  return {messages: [], opened: 0}
}

function foldLine(spine: CodexSpine, line: string): CodexSpine {
  const trimmed = line.trim()
  if (!trimmed) return spine
  const payload = payloadOf(trimmed)
  if (!payload) return spine
  const event = spineEvent(payload)
  if (event) applyEvent(spine, event)
  return spine
}

function spineMessages(spine: CodexSpine): UIMessage[] {
  return spine.messages.map((message) => ({...message, parts: [...message.parts]}))
}

function parseHistory(raw: string): UIMessage[] {
  return raw.split('\n').reduce(foldLine, emptySpine()).messages
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

async function scanForRollout(sessionId: string, home: string): Promise<string | null> {
  const suffix = `-${sessionId}.jsonl`
  const entries = await readdir(sessionsRoot(home), {withFileTypes: true, recursive: true}).catch(() => [])
  const hit = entries.find((entry) => entry.isFile() && entry.name.endsWith(suffix))
  return hit ? join(hit.parentPath, hit.name) : null
}

export async function rolloutPath(sessionId: string, home: string = homedir()): Promise<string | null> {
  const row = threadRows(stateDbPath(home), THREAD_BY_ID, [sessionId]).at(0)
  if (row) return row.rollout_path
  return scanForRollout(sessionId, home)
}

async function rolloutFor(cwd: string, sessionId: string, home: string): Promise<{path: string; raw: string} | null> {
  const path = await rolloutPath(sessionId, home)
  if (!path) return null
  const raw = await readFile(path, 'utf8').catch(() => '')
  if (!raw) return null
  return rolloutCwd(raw) === cwd ? {path, raw} : null
}

async function transcriptMessages(cwd: string, sessionId: string, home: string = homedir()): Promise<UIMessage[]> {
  const rollout = await rolloutFor(cwd, sessionId, home)
  return rollout ? parseHistory(rollout.raw) : []
}

async function transcriptStat(
  cwd: string,
  sessionId: string,
  home: string = homedir(),
): Promise<TranscriptStat | null> {
  const rollout = await rolloutFor(cwd, sessionId, home)
  if (!rollout) return null
  const info = await stat(rollout.path).catch(() => null)
  return info ? {mtimeMs: info.mtimeMs, size: info.size} : null
}

async function listSessions(cwd: string, home: string = homedir()): Promise<HarnessSessionMeta[]> {
  const rows = threadRows(stateDbPath(home), LIST_THREADS, [cwd])
  return Promise.all(
    rows.map(async (row) => {
      const raw = await readFile(row.rollout_path, 'utf8').catch(() => '')
      return {
        id: row.id,
        derivedTitle: firstText(row),
        updatedAt: millis(row.updated_at_ms, row.updated_at),
        messageCount: parseHistory(raw).length,
        model: row.model ?? null,
        totalTokens: row.tokens_used ?? 0,
        lastMessage: condense(row.preview, MAX_PREVIEW) || null,
        createdAt: millis(row.created_at_ms, row.created_at),
      }
    }),
  )
}

function observeTranscript(cwd: string, sessionId: string, home: string = homedir()): TranscriptHandle {
  return makeJsonlHandle<CodexSpine>({
    parser: {empty: emptySpine, foldLine, messages: spineMessages},
    resolvePath: async () => {
      const path = await rolloutPath(sessionId, home)
      return path ?? transcriptFailure('missing', `no codex rollout recorded for ${sessionId}`)
    },
    verifyHead: (head) => {
      const found = rolloutCwd(head)
      if (found === null) return transcriptFailure('corrupt', `no session_meta in the head of the ${sessionId} rollout`)
      return found === cwd ? null : transcriptFailure('missing', `${sessionId} was recorded in ${found}, not ${cwd}`)
    },
  })
}

export const codexHistory: HarnessHistory = {
  messages: transcriptMessages,
  transcriptStat,
  observe: observeTranscript,
  contextTokens: contextTokensFromTranscript,
  list: listSessions,
}
