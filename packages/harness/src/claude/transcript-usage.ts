import {readdir, stat} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import type {TranscriptUsage, TranscriptUsageQuery} from '@conciv/protocol/harness-types'
import type {TokenUsage} from '@conciv/protocol/usage-types'
import {parseJsonOrNull} from '@conciv/harness-init/json'
import {foldJsonlFile} from '../_shared/fold-jsonl-file.js'
import {whenMissing} from '../_shared/when-missing.js'
import {transcriptPath, transcriptRoot, withinProject} from './history.js'

export async function transcriptUsage(query: TranscriptUsageQuery): Promise<TranscriptUsage | null> {
  if (query.nativeId !== undefined) return usageOfNamed(query.cwd, query.nativeId)
  const read = await Promise.all((await candidates(query)).map((id) => readTranscript(query.cwd, id)))
  const inside = read.flatMap((transcript) => {
    const firstAt = transcript?.firstAt
    return transcript === null || firstAt === undefined || firstAt < query.from || firstAt > query.to
      ? []
      : [{transcript, firstAt}]
  })
  const newest = inside.toSorted((a, b) => b.firstAt - a.firstAt).at(0)
  return newest === undefined ? null : usageOf(newest.transcript)
}

async function usageOfNamed(cwd: string, nativeId: HarnessSessionId): Promise<TranscriptUsage | null> {
  if (!withinProject(cwd, nativeId)) return null
  const transcript = await readTranscript(cwd, nativeId)
  return transcript === null ? null : usageOf(transcript)
}

async function candidates(query: TranscriptUsageQuery): Promise<HarnessSessionId[]> {
  const root = transcriptRoot(query.cwd)
  const names = await readdir(root).catch(whenMissing<string[]>([]))
  const touched = await Promise.all(
    names
      .filter((name) => name.endsWith(JSONL))
      .map(async (name) => ({name, info: await stat(join(root, name)).catch(whenMissing(null))})),
  )
  return touched.flatMap(({name, info}) => {
    const id = HarnessSessionId.safeParse(name.slice(0, -JSONL.length))
    return info !== null && info.mtimeMs >= query.from && id.success ? [id.data] : []
  })
}

async function readTranscript(cwd: string, nativeId: HarnessSessionId): Promise<Transcript | null> {
  const folded = await foldJsonlFile(transcriptPath(cwd, nativeId), emptyFold(), foldLine).catch(whenMissing(null))
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
  const counts = names.reduce((tally, name) => tally.set(name, (tally.get(name) ?? 0) + 1), new Map<string, number>())
  return [...counts.entries()].toSorted((a, b) => b[1] - a[1]).at(0)?.[0]
}

function emptyFold(): Fold {
  return {firstAt: undefined, messages: new Map(), costs: []}
}

function foldLine(state: Fold, line: string): Fold {
  const raw = parseJsonOrNull(line.trim())
  if (raw === null) return state
  foldFirstAt(state, raw)
  foldAssistant(state, raw)
  foldResult(state, raw)
  return state
}

function foldFirstAt(state: Fold, raw: unknown): void {
  if (state.firstAt !== undefined) return
  const stamped = StampedSchema.safeParse(raw)
  const at = stamped.success && stamped.data.timestamp !== undefined ? Date.parse(stamped.data.timestamp) : Number.NaN
  if (!Number.isNaN(at)) state.firstAt = at
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

const StampedSchema = z.object({timestamp: z.string().optional()}).loose()

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
  firstAt: number | undefined
  messages: Map<string, {model: string; usage: AssistantUsage}>
  costs: number[]
}

type Transcript = Fold & {nativeId: HarnessSessionId}
