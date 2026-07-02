import {createInterface} from 'node:readline'
import type {Readable} from 'node:stream'
import {normalizeSystemPrompts, type StreamChunk, type TextOptions} from '@tanstack/ai'
import {BaseTextAdapter, type StructuredOutputOptions, type StructuredOutputResult} from '@tanstack/ai/adapters'
import type {HarnessAdapter, HarnessChild, HarnessImage, HarnessTurn} from '@conciv/protocol/harness-types'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'

export type SpawnHarness = (args: string[], cwd: string) => HarnessChild

export type HarnessAdapterDeps = {
  cwd: string
  spawnHarness: SpawnHarness
  systemPrompt: string
  resumeSessionId?: string | null
  permissionUrl?: string
  mcpUrl?: string
  onSessionId?: (id: string) => void
  onUsage?: (usage: UsageSnapshot) => void
  onSpawn?: (child: HarnessChild) => void
  model?: string
  turnKind?: 'chat' | 'compact'
  sessionId?: string
  env?: Record<string, string | undefined>
  decide?: (toolName: string, input: unknown, toolUseId: string) => Promise<'allow' | 'deny'>
}

type InputModalities = readonly ['text']
type MsgMeta = {text: unknown; image: unknown; audio: unknown; video: unknown; document: unknown}

export function lastUserModelText(messages: TextOptions['messages']): string {
  const last = messages.findLast((m) => m.role === 'user')
  if (!last || last.content === null) return ''
  if (typeof last.content === 'string') return last.content
  return last.content.flatMap((p) => (p.type === 'text' ? [p.content] : [])).join('\n')
}

export function lastUserImages(messages: TextOptions['messages']): HarnessImage[] {
  const last = messages.findLast((m) => m.role === 'user')
  if (!last || last.content === null || typeof last.content === 'string') return []
  return last.content.flatMap((p) => {
    if (p.type !== 'image' || p.source.type !== 'data') return []
    return [{mediaType: p.source.mimeType, dataBase64: p.source.value}]
  })
}

async function* linesOf(stream: Readable): AsyncGenerator<string> {
  const rl = createInterface({input: stream, crlfDelay: Infinity})
  for await (const line of rl) yield line
}

export class HarnessTextAdapter extends BaseTextAdapter<string, Record<string, never>, InputModalities, MsgMeta> {
  readonly name: string
  private readonly harness: HarnessAdapter
  private readonly deps: HarnessAdapterDeps

  constructor(harness: HarnessAdapter, deps: HarnessAdapterDeps) {
    super({}, harness.id)
    this.harness = harness
    this.deps = deps
    this.name = harness.id
  }

  async *chatStream(options: TextOptions<Record<string, never>>): AsyncIterable<StreamChunk> {
    const {harness, deps} = this
    options.logger.request(`activity=chat provider=${harness.id} messages=${options.messages.length} stream=true`, {
      provider: harness.id,
      model: harness.id,
    })
    const mode = harness.capabilities.systemPrompt
    const sysFromPrompts = normalizeSystemPrompts(options.systemPrompts)
      .map((p) => p.content)
      .join('\n')
    const sysText = sysFromPrompts || deps.systemPrompt
    const userText = lastUserModelText(options.messages)
    const images = harness.capabilities.imageInput === false ? [] : lastUserImages(options.messages)
    const turn: HarnessTurn = {
      prompt: mode === 'none' && sysText ? `${sysText}\n\n${userText}` : userText,
      cwd: deps.cwd,
      resumeSessionId: deps.resumeSessionId ?? null,
      systemPrompt: mode === 'none' ? '' : sysText,
      permissionUrl: deps.permissionUrl,
      mcpUrl: deps.mcpUrl,
      ...(deps.sessionId ? {sessionId: deps.sessionId} : {}),
      ...(images.length ? {images} : {}),
      ...(deps.model ? {model: deps.model} : {}),
      kind: deps.turnKind ?? 'chat',
    }
    if (harness.run) {
      yield* harness.run(turn, {
        sessionId: deps.sessionId ?? '',
        env: deps.env ?? {},
        signal: options.abortController?.signal ?? new AbortController().signal,
        decide: deps.decide ?? (async () => 'allow'),
        onSessionId: (id) => deps.onSessionId?.(id),
        onUsage: deps.onUsage ? (usage) => deps.onUsage?.(usage) : undefined,
        runId: options.runId,
        threadId: options.threadId,
        logger: options.logger,
      })
      return
    }

    const args =
      turn.kind === 'compact' && harness.capabilities.compaction && harness.buildCompactArgs
        ? harness.buildCompactArgs(turn)
        : harness.buildArgs(turn)
    const child = deps.spawnHarness(args, deps.cwd)
    deps.onSpawn?.(child)
    options.abortController?.signal.addEventListener('abort', () => child.kill())
    await harness.deliverInput?.(child, turn)
    try {
      yield* harness.decode(linesOf(child.stdout), {
        onSessionId: (id) => deps.onSessionId?.(id),
        onUsage: deps.onUsage ? (usage) => deps.onUsage?.(usage) : undefined,
        runId: options.runId,
        threadId: options.threadId,
        logger: options.logger,
      })
    } catch (error) {
      options.logger.errors(`${harness.id}.chatStream fatal`, {error, source: `${harness.id}.chatStream`})
      throw error
    }
  }

  structuredOutput(_options: StructuredOutputOptions<Record<string, never>>): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(
      new Error(
        `harness '${this.harness.id}' does not support structured output (coding CLIs have no native schema mode)`,
      ),
    )
  }
}

export function harnessText(harness: HarnessAdapter, deps: HarnessAdapterDeps): HarnessTextAdapter {
  return new HarnessTextAdapter(harness, deps)
}
