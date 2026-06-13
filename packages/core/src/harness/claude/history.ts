import {homedir} from 'node:os'
import {join} from 'node:path'
import {z} from 'zod'
import type {MessagePart, UIMessage} from '@devgent/protocol/chat-types'
import {defineHarnessHistory} from '@devgent/protocol/harness-types'
import {TextBlock, ThinkingBlock, ToolUseBlock} from './blocks.js'

// Claude transcript location + history parsing. Both live here so the claude adapter has a
// single history module. transcriptPath says WHERE claude persists a session's JSONL;
// parseHistory turns that JSONL into filtered, human-readable UIMessages.

// Claude encodes the project dir by replacing every non-alphanumeric path char with '-'.
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

// Where Claude persists a session's JSONL transcript:
// ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
export function transcriptPath(cwd: string, sessionId: string, home: string = homedir()): string {
  return join(home, '.claude', 'projects', encodeProjectDir(cwd), `${sessionId}.jsonl`)
}

// Internal turns we hide from the human-readable chat history: the injected progress ticks,
// NEEDS_INFO sentinels, and system-reminder wrappers that the agent's iterate loop adds.
const INTERNAL_MARKERS = ['VIBE_PROGRESS_TICK', 'NEEDS_INFO:', '<system-reminder>']

const TranscriptRecordSchema = z
  .object({
    type: z.string(),
    message: z.object({content: z.array(z.unknown()).optional()}).loose().optional(),
  })
  .loose()

function partsFrom(content: unknown): MessagePart[] {
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

// Parse a Claude session JSONL transcript into filtered, human-readable UIMessages. Drops
// system/meta records and internal iterate/progress prompts. Skips bad lines (tolerant of
// transcript-format drift).
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

// Claude's HarnessHistory implementation, authored through the protocol's define* factory.
export const claudeHistory = defineHarnessHistory({transcriptPath, parse: parseHistory})
