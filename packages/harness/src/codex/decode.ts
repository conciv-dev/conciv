import {z} from 'zod'
import type {StreamChunk} from '@tanstack/ai'
import {
  runAgui,
  textMessage,
  reasoningMessage,
  toolCall,
  toolResult,
  type Mint,
  type SessionSink,
  type StepContext,
} from '../_shared/agui.js'

// Translate `codex exec --json` JSONL events into the AG-UI StreamChunk stream. Only the event
// schema + the event→chunks mapping are codex-specific; the run lifecycle, line loop, and chunk
// emitters live in ../_shared/agui.ts. thread_id surfaces the session id.

const AgentMessageItem = z.object({type: z.literal('agent_message'), id: z.string(), text: z.string()})
const ReasoningItem = z.object({type: z.literal('reasoning'), id: z.string(), text: z.string()})
const CommandItem = z.object({
  type: z.literal('command_execution'),
  id: z.string(),
  command: z.string(),
  aggregated_output: z.string().optional(),
})

const CodexEventSchema = z
  .object({type: z.string(), thread_id: z.string().optional(), item: z.unknown().optional()})
  .loose()
type CodexEvent = z.infer<typeof CodexEventSchema>

// A completed command_execution maps to a full tool-call lifecycle plus its captured output.
function* commandChunks(cmd: z.infer<typeof CommandItem>, mint: Mint): Generator<StreamChunk> {
  yield* toolCall(cmd.id, 'shell', {command: cmd.command})
  yield* toolResult(mint('r'), cmd.id, cmd.aggregated_output ?? '')
}

function* itemChunks(item: unknown, mint: Mint): Generator<StreamChunk> {
  const message = AgentMessageItem.safeParse(item)
  if (message.success) return yield* textMessage(mint('m'), message.data.text)
  const reasoning = ReasoningItem.safeParse(item)
  if (reasoning.success) return yield* reasoningMessage(mint('t'), reasoning.data.text)
  const command = CommandItem.safeParse(item)
  if (command.success) yield* commandChunks(command.data, mint)
}

function* codexStep(e: CodexEvent, ctx: StepContext): Generator<StreamChunk> {
  if (e.type === 'thread.started' && e.thread_id) ctx.onSessionId(e.thread_id)
  // Emit on completion so partial item.started/updated deltas don't double-render.
  if (e.type === 'item.completed') yield* itemChunks(e.item, ctx.mint)
}

export function codexToAguiEvents(lines: AsyncIterable<string>, opts: SessionSink): AsyncGenerator<StreamChunk> {
  return runAgui(lines, CodexEventSchema, opts, codexStep)
}
