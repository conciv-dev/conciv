import {readdir, stat, readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join, resolve, sep} from 'node:path'
import {z} from 'zod'
import type {MessagePart, UIMessage} from '@aidx/protocol/chat-types'
import type {HarnessHistory, HarnessSessionMeta} from '@aidx/protocol/harness-types'
import {TextBlock, ThinkingBlock, ToolUseBlock} from './blocks.js'

// Where claude persists a session's JSONL transcript, and how to parse it into UIMessages.

// Claude encodes the project dir by replacing every non-alphanumeric path char with '-'.
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

// Where Claude persists a session's JSONL transcript:
// ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
export function transcriptPath(cwd: string, sessionId: string, home: string = homedir()): string {
  return join(home, '.claude', 'projects', encodeProjectDir(cwd), `${sessionId}.jsonl`)
}

// Internal turns hidden from human-readable history (progress ticks, sentinels, reminders).
const INTERNAL_MARKERS = ['VIBE_PROGRESS_TICK', 'NEEDS_INFO:', '<system-reminder>']

const TranscriptRecordSchema = z
  .object({
    type: z.string(),
    message: z
      .object({content: z.union([z.string(), z.array(z.unknown())]).optional()})
      .loose()
      .optional(),
  })
  .loose()

function partsFrom(content: unknown): MessagePart[] {
  // claude stores user turns as a plain string and assistant turns as a content-block array.
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
        name: tool.data.name,
        arguments: JSON.stringify(tool.data.input ?? {}),
        state: 'input-complete',
      })
    }
  }
  return out
}

function isInternal(parts: MessagePart[]): boolean {
  const text = parts
    .filter((p) => p.type === 'text')
    .map((p) => ('content' in p ? p.content : ''))
    .join('\n')
  return INTERNAL_MARKERS.some((m) => text.includes(m))
}

function parseRecord(line: string): z.infer<typeof TranscriptRecordSchema> | null {
  try {
    const result = TranscriptRecordSchema.safeParse(JSON.parse(line))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

// Parse a claude JSONL transcript into filtered, human-readable UIMessages.
export function parseHistory(jsonl: string): UIMessage[] {
  const out: UIMessage[] = []
  const idState = {n: 0}
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const e = parseRecord(trimmed)
    if (!e) continue
    if (e.type !== 'user' && e.type !== 'assistant') continue
    const parts = partsFrom(e.message?.content)
    if (parts.length === 0 || isInternal(parts)) continue
    idState.n += 1
    out.push({id: `h${idState.n}`, role: e.type, parts})
  }
  return out
}

const SummaryRecordSchema = z.object({type: z.literal('summary'), summary: z.string()}).loose()

// The last `summary` record claude wrote for this transcript, or null if none.
export function nameFromTranscript(jsonl: string): string | null {
  let name: string | null = null
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = SummaryRecordSchema.safeParse(JSON.parse(trimmed))
      if (parsed.success && parsed.data.summary) name = parsed.data.summary
    } catch {
      // not JSON — skip
    }
  }
  return name
}

// Enrichment records: a 'system' init line carries the model; a 'result' line carries cumulative
// usage. Both are .loose so unrelated fields don't trip parsing.
const SystemRecordSchema = z.object({type: z.literal('system'), model: z.string().optional()}).loose()
const ResultRecordSchema = z
  .object({
    type: z.literal('result'),
    usage: z.object({input_tokens: z.number().optional(), output_tokens: z.number().optional()}).loose().optional(),
  })
  .loose()
const StampedRecordSchema = z.object({timestamp: z.string().optional()}).loose()

// The last text of any human-readable turn, condensed to one line (≤200 chars), or null.
function lastMessageFrom(jsonl: string): string | null {
  let last: string | null = null
  for (const line of jsonl.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const rec = parseRecord(t)
    if (!rec || (rec.type !== 'user' && rec.type !== 'assistant')) continue
    const parts = partsFrom(rec.message?.content)
    if (isInternal(parts)) continue
    const text = parts.find((p) => p.type === 'text')
    if (text && text.type === 'text' && typeof text.content === 'string')
      last = text.content.replace(/\s+/g, ' ').trim().slice(0, 200)
  }
  return last
}

// Parse a transcript into an enriched session row: title + count + model + token total + last
// message + first-event timestamp. One pass over the lines for the cheap scalars; reuses the shared
// parse helpers for title/count/last-message.
export function parseSessionMeta(id: string, jsonl: string, mtime: number): HarnessSessionMeta {
  let model: string | null = null
  let totalTokens = 0
  let createdAt: number | undefined
  for (const line of jsonl.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let obj: unknown
    try {
      obj = JSON.parse(t)
    } catch {
      continue
    }
    const sys = SystemRecordSchema.safeParse(obj)
    if (sys.success && sys.data.model) model = sys.data.model
    const result = ResultRecordSchema.safeParse(obj)
    if (result.success && result.data.usage)
      totalTokens += (result.data.usage.input_tokens ?? 0) + (result.data.usage.output_tokens ?? 0)
    if (createdAt === undefined) {
      const stamped = StampedRecordSchema.safeParse(obj)
      const ms = stamped.success && stamped.data.timestamp ? Date.parse(stamped.data.timestamp) : NaN
      if (!Number.isNaN(ms)) createdAt = ms
    }
  }
  return {
    id,
    derivedTitle: titleFromHead(jsonl),
    updatedAt: Math.round(mtime),
    messageCount: parseHistory(jsonl).length,
    model,
    totalTokens,
    lastMessage: lastMessageFrom(jsonl),
    createdAt,
  }
}

const MAX_SESSIONS = 50

// The first user line's text, condensed to a one-line title (≤80 chars). Reuses the same private
// parseRecord/partsFrom helpers as parseHistory — no duplicate parsing.
function titleFromHead(raw: string): string {
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const rec = parseRecord(t)
    if (rec?.type === 'user') {
      const parts = partsFrom(rec.message?.content)
      const text = parts.find((p) => p.type === 'text')
      if (text && text.type === 'text' && typeof text.content === 'string')
        return text.content.replace(/\s+/g, ' ').trim().slice(0, 80)
    }
  }
  return ''
}

// Enumerate the cwd's claude sessions, newest first, capped at MAX_SESSIONS. Stat all transcripts,
// sort by mtime, then read only the top N (title + message count). Never throws — a missing dir or
// unreadable file yields [] / an empty entry.
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
  const top = stamped.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_SESSIONS)
  return Promise.all(
    top.map(async (f) => {
      const raw = await readFile(join(dir, f.name), 'utf8').catch(() => '')
      return parseSessionMeta(f.name.replace(/\.jsonl$/, ''), raw, f.mtime)
    }),
  )
}

// True iff the resolved transcript path stays inside the project dir (defense-in-depth vs traversal).
export function withinProject(cwd: string, sessionId: string, home: string = homedir()): boolean {
  const root = resolve(join(home, '.claude', 'projects', encodeProjectDir(cwd)))
  return resolve(transcriptPath(cwd, sessionId, home)).startsWith(root + sep)
}

// Claude's HarnessHistory implementation.
export const claudeHistory: HarnessHistory = {
  transcriptPath,
  parse: parseHistory,
  nameFromTranscript,
  list: listSessions,
}
