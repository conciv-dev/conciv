import {z} from 'zod'
import type {StreamChunk} from '@tanstack/ai'
import type {HarnessDecodeOpts} from '@conciv/protocol/harness-types'
import {
  runAgui,
  textMessage,
  reasoningMessage,
  toolCall,
  toolResult,
  type Mint,
  type StepContext,
  type UsageExtractor,
} from '../_shared/agui.js'

const AgentMessageItem = z.object({type: z.literal('agent_message'), id: z.string(), text: z.string()})
const ReasoningItem = z.object({type: z.literal('reasoning'), id: z.string(), text: z.string()})
const CommandItem = z.object({
  type: z.literal('command_execution'),
  id: z.string(),
  command: z.string(),
  aggregated_output: z.string().optional(),
  exit_code: z.number().optional(),
})

const CodexEventSchema = z
  .object({
    type: z.string(),
    thread_id: z.string().optional(),
    item: z.unknown().optional(),
    usage: z.unknown().optional(),
  })
  .loose()
type CodexEvent = z.infer<typeof CodexEventSchema>

function* commandChunks(cmd: z.infer<typeof CommandItem>, mint: Mint): Generator<StreamChunk> {
  yield* toolCall(cmd.id, 'shell', {command: cmd.command})
  const ok = cmd.exit_code === undefined || cmd.exit_code === 0
  yield* toolResult(mint('r'), cmd.id, cmd.aggregated_output ?? '', ok ? 'output-available' : 'output-error')
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

  if (e.type === 'item.completed') yield* itemChunks(e.item, ctx.mint)
}

const CodexUsage = z.object({input_tokens: z.number().optional(), output_tokens: z.number().optional()}).loose()

const codexUsage: UsageExtractor<CodexEvent> = (e) => {
  if (e.type !== 'turn.completed') return null
  const u = CodexUsage.safeParse(e.usage)
  if (!u.success) return null
  return {inputTokens: u.data.input_tokens, outputTokens: u.data.output_tokens}
}

export function codexToAguiEvents(lines: AsyncIterable<string>, opts: HarnessDecodeOpts): AsyncGenerator<StreamChunk> {
  return runAgui(lines, CodexEventSchema, opts, codexStep, codexUsage)
}
