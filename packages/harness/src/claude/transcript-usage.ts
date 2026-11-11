import type {Dirent} from 'node:fs'
import {readdir} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import type {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {TranscriptUsage, TranscriptUsageQuery} from '@conciv/protocol/harness-types'
import type {TokenUsage} from '@conciv/protocol/usage-types'
import {parseJsonOrNull} from '@conciv/harness-init/json'
import {foldJsonlFile} from '../_shared/fold-jsonl-file.js'
import {whenMissing} from '../_shared/when-missing.js'
import {transcriptPath, transcriptRoot, withinProject} from './history.js'

export async function transcriptUsage(query: TranscriptUsageQuery): Promise<TranscriptUsage | null> {
  const {cwd, nativeId} = query
  const own = withinProject(cwd, nativeId) ? await readTranscript(transcriptPath(cwd, nativeId), nativeId) : null
  if (own !== null) return usageOf(own)
  const projects = dirname(transcriptRoot(cwd))
  const entries = await readdir(projects, {withFileTypes: true}).catch(whenMissing<Dirent[]>([]))
  const found = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readTranscript(join(projects, entry.name, `${nativeId}${JSONL}`), nativeId)),
  )
  const transcript = found.find((each) => each !== null)
  return transcript === undefined ? null : usageOf(transcript)
}

async function readTranscript(path: string, nativeId: HarnessSessionId): Promise<Transcript | null> {
  const folded = await foldJsonlFile(path, emptyFold(), foldLine).catch(whenMissing(null))
  return folded === null ? null : {nativeId, ...folded}
}

function usageOf(transcript: Transcript): TranscriptUsage | null {
  const messages = [...transcript.messages.values()]
  const model = mostUsed(messages.map((message) => message.model).filter((name) => name !== SYNTHETIC))
  if (model === undefined) return null
  const sum = (pick: (usage: AssistantUsage) => number | undefined) =>
    messages.reduce((total, message) => total + (pick(message.usage) ?? 0), 0)
  const cacheRead = sum((usage) => usage.cache_read_input_tokens)
  const cacheWrite = sum((usage) => usage.cache_creation_input_tokens)
  const promptTokens = sum((usage) => usage.input_tokens) + cacheRead + cacheWrite
  const completionTokens = sum((usage) => usage.output_tokens)
  const details = {
    ...(cacheRead === 0 ? {} : {cachedTokens: cacheRead}),
    ...(cacheWrite === 0 ? {} : {cacheWriteTokens: cacheWrite}),
  }
  const cost = transcript.costs.length === 0 ? undefined : transcript.costs.reduce((total, each) => total + each, 0)
  const usage: TokenUsage = {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    ...(Object.keys(details).length === 0 ? {} : {promptTokensDetails: details}),
    ...(cost === undefined ? {} : {cost}),
  }
  return {nativeId: transcript.nativeId, model, usage, ...(cost === undefined ? {} : {cost})}
}

function mostUsed(names: string[]): string | undefined {
  return [...Map.groupBy(names, (name) => name).entries()].toSorted((a, b) => b[1].length - a[1].length).at(0)?.[0]
}

function emptyFold(): Fold {
  return {messages: new Map(), costs: []}
}

function foldLine(state: Fold, line: string): Fold {
  const raw = parseJsonOrNull(line.trim())
  if (raw === null) return state
  foldAssistant(state, raw)
  foldResult(state, raw)
  return state
}

function foldAssistant(state: Fold, raw: unknown): void {
  const record = AssistantSchema.safeParse(raw)
  if (!record.success) return
  const {id, model, usage} = record.data.message
  state.messages.set(id ?? `${state.messages.size}`, {model, usage})
}

function foldResult(state: Fold, raw: unknown): void {
  const record = ResultSchema.safeParse(raw)
  if (record.success) state.costs.push(record.data.total_cost_usd)
}

const JSONL = '.jsonl'

const SYNTHETIC = '<synthetic>'

const UsageSchema = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
  })
  .loose()

type AssistantUsage = z.infer<typeof UsageSchema>

const AssistantSchema = z
  .object({
    type: z.literal('assistant'),
    message: z.object({id: z.string().optional(), model: z.string(), usage: UsageSchema}).loose(),
  })
  .loose()

const ResultSchema = z.object({type: z.literal('result'), total_cost_usd: z.number()}).loose()

type Fold = {
  messages: Map<string, {model: string; usage: AssistantUsage}>
  costs: number[]
}

type Transcript = Fold & {nativeId: HarnessSessionId}
