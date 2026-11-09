import {createReadStream, readdirSync, type Dirent} from 'node:fs'
import {open, readdir, stat} from 'node:fs/promises'
import {createInterface} from 'node:readline'
import {homedir} from 'node:os'
import {join, resolve} from 'node:path'
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
import {parseJsonOrNull} from '@conciv/harness-init/json'
import {containedPath} from '../_shared/contained-path.js'
import {makeJsonlHandle, transcriptFailure} from '../_shared/jsonl-handle.js'
import {transcriptPage, type TranscriptStamp} from '../_shared/transcript-page.js'
import {whenMissing} from '../_shared/when-missing.js'
import {foldJsonlFile} from '../_shared/fold-jsonl-file.js'
import {tailLines} from '../_shared/tail-lines.js'

const MAX_TITLE = 80
const TAIL_BYTES = 65_536

export function encodeSessionDir(cwd: string): string {
  return `--${resolve(cwd)
    .replace(/^[/\\]/, '')
    .replace(/[/\\:]/g, '-')}--`
}

function sessionsRoot(): string {
  return join(process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent'), 'sessions')
}

export function sessionsDir(cwd: string): string {
  return join(sessionsRoot(), encodeSessionDir(cwd))
}

const EntrySchema = z
  .object({type: z.string(), id: z.string(), parentId: z.string().nullish(), message: z.unknown().optional()})
  .loose()
const HeaderSchema = z
  .object({type: z.literal('session'), id: z.string(), timestamp: z.string().optional(), cwd: z.string().optional()})
  .loose()
const SessionInfoSchema = z.object({type: z.literal('session_info'), name: z.string()}).loose()

type Entry = z.infer<typeof EntrySchema>

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

function partsFrom(content: unknown): ChatPart[] {
  if (typeof content === 'string') return content ? [{type: 'text', content}] : []
  if (!Array.isArray(content)) return []
  return content.flatMap<ChatPart>((block) => {
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

function spokenMessage(raw: unknown): {role: 'user' | 'assistant'; parts: ChatPart[]} | null {
  const user = UserMessageSchema.safeParse(raw)
  if (user.success) return {role: 'user', parts: partsFrom(user.data.content)}
  const assistant = AssistantMessageSchema.safeParse(raw)
  if (assistant.success) return {role: 'assistant', parts: partsFrom(assistant.data.content)}
  return null
}

function toolResultPart(raw: unknown): ChatPart | null {
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

function messagesOf(entries: Entry[]): ChatMessage[] {
  return pathMessages(activePath(entries))
}

function pathMessages(path: Entry[]): ChatMessage[] {
  const out: ChatMessage[] = []
  const idState = {n: 0}
  const open = (role: 'user' | 'assistant', parts: ChatPart[], nativeId: string | undefined): void => {
    idState.n += 1
    out.push({id: nativeId ?? `h${idState.n}`, role, parts})
  }

  for (const entry of path) {
    const spoken = spokenMessage(entry.message)
    if (spoken) {
      if (spoken.parts.length > 0) open(spoken.role, spoken.parts, entry.id)
      continue
    }
    const part = toolResultPart(entry.message)
    if (!part) continue
    const owner = out.findLast((message) => message.role === 'assistant')
    if (owner) owner.parts.push(part)
    else open('assistant', [part], entry.id)
  }
  return out
}

function condense(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
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
  } catch (error) {
    return whenMissing([])(error)
  }
}

function transcriptRoot(cwd: string): string {
  return sessionsDir(cwd)
}

function transcriptPath(cwd: string, sessionId: string): string {
  const dir = sessionsDir(cwd)
  const suffix = `_${sessionId}.jsonl`
  return join(dir, namesIn(dir).find((name) => name.endsWith(suffix)) ?? `${sessionId}.jsonl`)
}

function containedTranscript(cwd: string, sessionId: string): string | null {
  return containedPath(transcriptRoot(cwd), transcriptPath(cwd, sessionId))
}

async function transcriptMessages(cwd: string, sessionId: string): Promise<ChatMessage[]> {
  const path = containedTranscript(cwd, sessionId)
  if (path === null) return []
  const folded = await foldJsonlFile(path, emptyFold(), foldLine).catch(whenMissing(null))
  return folded === null ? [] : messagesOf(folded.entries)
}

function observeTranscript(cwd: string, sessionId: string): TranscriptHandle {
  return makeJsonlHandle<PiFold>({
    parser: {empty: emptyFold, foldLine, messages: (state) => messagesOf(state.entries)},
    resolvePath: async () => {
      const dir = sessionsDir(cwd)
      const names = await readdir(dir).catch(whenMissing([]))
      const found = names.find((name) => name.endsWith(`_${sessionId}.jsonl`))
      const contained = found ? containedPath(dir, join(dir, found)) : null
      if (contained) return contained
      return transcriptFailure('missing', `no pi transcript for ${sessionId} in ${dir}`)
    },
  })
}

function startedAt(timestamp: string | undefined): number | undefined {
  const parsed = timestamp ? Date.parse(timestamp) : NaN
  return Number.isNaN(parsed) ? undefined : parsed
}

type MetaHead = {cwd: string | null; createdAt: number | undefined; name: string | null; firstUser: string | null}

async function sessionMeta(
  id: HarnessSessionId,
  path: string,
  stamp: TranscriptStamp,
  projectCwd: string | null,
): Promise<HarnessSessionMeta | null> {
  const head = await metaHead(path).catch(whenMissing(null))
  const cwd = head?.cwd ?? projectCwd
  if (head === null || cwd === null) return null
  const name = (await tailName(path, stamp.sizeBytes)) ?? head.name
  return {
    id,
    cwd,
    derivedTitle: condense(name ?? head.firstUser ?? '', MAX_TITLE),
    updatedAt: stamp.updatedAt,
    sizeBytes: stamp.sizeBytes,
    createdAt: head.createdAt,
  }
}

async function metaHead(path: string): Promise<MetaHead> {
  const stream = createReadStream(path, {encoding: 'utf8'})
  const head: MetaHead = {cwd: null, createdAt: undefined, name: null, firstUser: null}
  try {
    for await (const line of createInterface({input: stream, crlfDelay: Number.POSITIVE_INFINITY})) {
      const record = parseJsonOrNull(line.trim())
      const header = HeaderSchema.safeParse(record)
      if (header.success) {
        head.cwd = header.data.cwd ?? null
        head.createdAt = startedAt(header.data.timestamp)
      }
      const info = SessionInfoSchema.safeParse(record)
      if (info.success) head.name = info.data.name
      head.firstUser = firstUserOf(record)
      if (head.firstUser !== null) return head
    }
    return head
  } finally {
    stream.destroy()
  }
}

function firstUserOf(record: unknown): string | null {
  const entry = EntrySchema.safeParse(record)
  if (!entry.success || entry.data.type !== 'message') return null
  const spoken = spokenMessage(entry.data.message)
  if (spoken === null || spoken.role !== 'user') return null
  const text = spoken.parts.find((part) => part.type === 'text')
  return text !== undefined && text.type === 'text' ? text.content : null
}

async function tailName(path: string, sizeBytes: number): Promise<string | null> {
  if (sizeBytes === 0) return null
  const length = Math.min(sizeBytes, TAIL_BYTES)
  const handle = await open(path, 'r')
  try {
    const {buffer, bytesRead} = await handle.read(Buffer.alloc(length), 0, length, sizeBytes - length)
    const names = buffer
      .toString('utf8', 0, bytesRead)
      .split('\n')
      .filter((line) => line.includes('"session_info"'))
      .flatMap((line) => {
        const info = SessionInfoSchema.safeParse(parseJsonOrNull(line.trim()))
        return info.success ? [info.data.name] : []
      })
    return names.at(-1) ?? null
  } finally {
    await handle.close()
  }
}

async function listSessions(scope: HarnessListScope, page: HarnessListPage): Promise<HarnessSessionPage> {
  const projectCwd = 'cwd' in scope ? scope.cwd : null
  const dirs = projectCwd === null ? await projectDirs() : [sessionsDir(projectCwd)]
  return transcriptPage(dirs, page, transcriptId, (id, path, stamp) => sessionMeta(id, path, stamp, projectCwd))
}

async function projectDirs(): Promise<string[]> {
  const root = sessionsRoot()
  const entries = await readdir(root, {withFileTypes: true}).catch(whenMissing<Dirent[]>([]))
  return entries
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => containedPath(root, join(root, entry.name)) ?? [])
}

function transcriptId(name: string): HarnessSessionId | null {
  if (!name.endsWith('.jsonl')) return null
  const parsed = HarnessSessionId.safeParse(sessionIdToken(name))
  return parsed.success ? parsed.data : null
}

async function storedMeta(cwd: string, sessionId: HarnessSessionId): Promise<HarnessSessionMeta | null> {
  const path = containedTranscript(cwd, sessionId)
  if (path === null) return null
  const info = await stat(path).catch(whenMissing(null))
  if (!info) return null
  return sessionMeta(sessionId, path, {updatedAt: Math.round(info.mtimeMs), sizeBytes: info.size}, cwd)
}

function entryOf(line: string): Entry | null {
  const parsed = EntrySchema.safeParse(parseJsonOrNull(line.trim()))
  return parsed.success ? parsed.data : null
}

function onChain(entry: Entry, wanted: string | null): boolean {
  return wanted === null ? entry.type === 'message' : entry.id === wanted
}

function chainRole(entry: Entry): 'user' | 'assistant' | 'result' | null {
  const spoken = spokenMessage(entry.message)
  if (spoken !== null) return spoken.parts.length > 0 ? spoken.role : null
  return toolResultPart(entry.message) === null ? null : 'result'
}

function chainScanner(
  wanted: string | null,
): (line: string) => {line: Entry; boundary: boolean; first: boolean} | null {
  const chain = {wanted, orphanResults: false}
  return (line) => {
    const entry = entryOf(line)
    if (entry === null || !onChain(entry, chain.wanted)) return null
    chain.wanted = entry.parentId || null
    const role = chainRole(entry)
    const boundary = role === 'user' && !chain.orphanResults
    if (role === 'assistant') chain.orphanResults = false
    if (role === 'result') chain.orphanResults = true
    return {line: entry, boundary, first: chain.wanted === null}
  }
}

const ChainCursorSchema = z
  .string()
  .regex(/^\d+:.+$/)
  .transform((cursor) => {
    const separator = cursor.indexOf(':')
    return {end: Number(cursor.slice(0, separator)), wanted: cursor.slice(separator + 1)}
  })

async function transcriptTail(cwd: string, sessionId: string, options: TranscriptTailOptions): Promise<TranscriptPage> {
  const empty: TranscriptPage = {messages: [], earlier: null}
  const path = containedTranscript(cwd, sessionId)
  const cursor = options.before === null ? null : ChainCursorSchema.safeParse(options.before)
  if (path === null || cursor?.success === false) return empty
  const page = tailLines({
    path,
    end: cursor?.data.end ?? null,
    limit: options.limit,
    signal: options.signal,
    scan: chainScanner(cursor?.data.wanted ?? null),
    fold: pathMessages,
    cursor: (entry, offset) => `${offset}:${entry.parentId}`,
  })
  return page.catch(whenMissing(empty))
}

export const piHistory: HarnessHistory = {
  messages: transcriptMessages,
  tail: transcriptTail,
  observe: observeTranscript,
  transcriptPath,
  transcriptRoot,
  list: listSessions,
  meta: storedMeta,
}
