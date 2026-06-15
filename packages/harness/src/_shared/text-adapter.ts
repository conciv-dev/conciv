import {createInterface} from 'node:readline'
import type {Readable} from 'node:stream'
import {normalizeSystemPrompts, type StreamChunk, type TextOptions} from '@tanstack/ai'
import {BaseTextAdapter, type StructuredOutputOptions, type StructuredOutputResult} from '@tanstack/ai/adapters'
import type {HarnessAdapter, HarnessChild, HarnessImage, HarnessTurn} from '@aidx/protocol/harness-types'
import type {UsageSnapshot} from '@aidx/protocol/usage-types'

export type SpawnHarness = (args: string[], cwd: string) => HarnessChild

export type HarnessAdapterDeps = {
  cwd: string
  spawnHarness: SpawnHarness
  systemPrompt: string // resolved text or file path, per harness.capabilities.systemPrompt
  resumeSessionId?: string | null
  permissionUrl?: string
  mcpUrl?: string
  onSessionId?: (id: string) => void
  onUsage?: (usage: UsageSnapshot) => void // live usage mid-turn, for core to inject
  onSpawn?: (child: HarnessChild) => void // route acquires the lock here
}

type InputModalities = readonly ['text']
type MsgMeta = {text: unknown; image: unknown; audio: unknown; video: unknown; document: unknown}

// Latest user-turn text from chat()'s ModelMessage[] (content is string | null | ContentPart[]).
// flatMap + the `type` discriminant narrows each part — no cast, no type-guard predicate.
export function lastUserModelText(messages: TextOptions['messages']): string {
  const last = [...messages].reverse().find((m) => m.role === 'user')
  if (!last || last.content === null) return ''
  if (typeof last.content === 'string') return last.content
  return last.content.flatMap((p) => (p.type === 'text' ? [p.content] : [])).join('\n')
}

// Image parts from the latest user turn. Narrow `type==='image'` then `source.type==='data'`
// (the data source carries base64) — cast-free; `source.mimeType` is the verified field name.
export function lastUserImages(messages: TextOptions['messages']): HarnessImage[] {
  const last = [...messages].reverse().find((m) => m.role === 'user')
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

// Extends BaseTextAdapter (the library's cast-free way to satisfy the never-typed `'~types'`).
// A justified, narrow exception to functions-not-classes: a plain object cannot implement the
// TextAdapter interface without a cast, which the no-casts rule forbids.
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
      ...(images.length ? {images} : {}),
    }
    const child = deps.spawnHarness(harness.buildArgs(turn), deps.cwd)
    deps.onSpawn?.(child)
    options.abortController?.signal.addEventListener('abort', () => child.kill())
    await harness.deliverInput?.(child, turn) // e.g. claude native images → stream-json on stdin
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

// Factory wrapper so call sites read as functions; returns the adapter instance.
export function harnessText(harness: HarnessAdapter, deps: HarnessAdapterDeps): HarnessTextAdapter {
  return new HarnessTextAdapter(harness, deps)
}
