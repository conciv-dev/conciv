import {homedir} from 'node:os'
import {join} from 'node:path'
import {z} from 'zod'
import type {MessagePart, UIMessage} from '@aidx/protocol/chat-types'
import type {HarnessHistory} from '@aidx/protocol/harness-types'
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

// Claude's HarnessHistory implementation.
export const claudeHistory: HarnessHistory = {transcriptPath, parse: parseHistory, nameFromTranscript}
