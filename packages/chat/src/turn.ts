import {existsSync, readFileSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {readApprovalAsk, ChatEventType, sessionRunEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {tokenUsageToSnapshot, toTokenUsage, type UsageSnapshot} from '@conciv/protocol/usage-types'
import {type ContentPart, type ModelMessage} from '@conciv/protocol/chat-message-types'
import type {Turn, TurnHooks} from '@conciv/ai/server'
import type {AttachmentDocumentPart} from '@conciv/extension'
import {transcriptPathWithin} from '@conciv/harness'
import {isHarnessSessionId, SessionId, type HarnessSessionId, type ReasoningEffort} from '@conciv/protocol/chat-types'
import type {HarnessAdapter} from '@conciv/harness'
import type {ApprovalStore, UiChannel} from './approvals.js'
import {chatToolSet, type CodeCapability} from './code-mode.js'
import {normalizedChunk, toolNameNormalizer, type TranscriptImporter} from './transcript.js'

export type SessionRow = {
  model: string | null
  effort: ReasoningEffort | null
  nativeId: HarnessSessionId | null
  cwd: string
  harnessKind: string
}

export type SessionPort = {
  row: (sessionId: SessionId) => SessionRow | null
  ensure: (sessionId: SessionId) => Promise<void>
  recordNativeId: (sessionId: SessionId, harnessId: string, nativeId: HarnessSessionId) => Promise<void>
  recordUsage: (sessionId: SessionId, usage: UsageSnapshot) => Promise<void>
  recordContextTokens: (sessionId: SessionId, contextTokens: number) => Promise<void>
  recordActivity: (sessionId: SessionId, title: string, at: number) => void
  onRunStart: (sessionId: SessionId) => Promise<void>
  onRunEnd: (sessionId: SessionId) => Promise<void>
  publish: (sessionId: SessionId, chunk: ChatEvent) => void
}

export type SystemPromptSources = {systemPromptFile?: string; systemPromptText?: string}

export type InstructionReset = 'keep' | 'reset'

export type PluginInstructions = {initial: string; update: string}

export type AttachmentExpanders = Record<string, (part: AttachmentDocumentPart) => Promise<readonly ContentPart[]>>

export type TurnDeps = {
  cwd: string
  harnessFor: (sessionId: SessionId) => HarnessAdapter
  harnessEnv?: (sessionId?: SessionId) => NodeJS.ProcessEnv
  systemPrompt: SystemPromptSources
  sessions: SessionPort
  toolNames: ReadonlySet<string>
  capabilities: (sessionId: SessionId) => CodeCapability[]
  attachmentExpanders: AttachmentExpanders
  pluginInstructions: (sessionId: SessionId, reset: InstructionReset) => Promise<PluginInstructions>
  log: (message: string) => void
}

export const COMPACT_FALLBACK_PROMPT =
  'Summarize our conversation so far as concisely as you can: the key decisions, the current state, and any open threads, so we can continue with less context.'

const TITLE_MAX_CHARS = 120

export function buildSystemText(
  sources: SystemPromptSources,
  mode: HarnessAdapter['capabilities']['systemPrompt'],
  log: TurnDeps['log'],
): string {
  if (mode === 'none') return ''
  if (mode !== 'file' || sources.systemPromptFile === undefined) return sources.systemPromptText ?? ''
  try {
    return readFileSync(sources.systemPromptFile, 'utf8')
  } catch (error) {
    log(`[chat] system prompt file unreadable (${sources.systemPromptFile}), using inline text: ${String(error)}`)
    return sources.systemPromptText ?? ''
  }
}

function ownRow(harness: HarnessAdapter, row: SessionRow | null): SessionRow | null {
  return row?.harnessKind === harness.id ? row : null
}

function resumableToken(deps: TurnDeps, harness: HarnessAdapter, row: SessionRow | null): HarnessSessionId | null {
  if (row === null || row.harnessKind !== harness.id) return null
  return livingToken(deps, harness, row.nativeId)
}

function livingToken(deps: TurnDeps, harness: HarnessAdapter, token: HarnessSessionId | null): HarnessSessionId | null {
  if (token === null || !harness.capabilities.resume) return null
  const history = harness.history
  if (history === undefined) return token
  if (history.withinProject && !history.withinProject(deps.cwd, token)) return null
  if (history.transcriptPath === undefined) return token
  const path = transcriptPathWithin(history, deps.cwd, token)
  return path !== null && existsSync(path) ? token : null
}

function mintedSessionId(chunk: ChatEvent): HarnessSessionId | null {
  if (chunk.type !== ChatEventType.CUSTOM || !chunk.name.endsWith('.session-id')) return null
  const value = chunk.value
  if (typeof value !== 'object' || value === null || !('sessionId' in value)) return null
  return isHarnessSessionId(value.sessionId) ? value.sessionId : null
}

const EXPAND_FAILURE_PART: ContentPart = {
  type: 'text',
  content: '[attachment could not be processed]',
  metadata: {modelOnly: true},
}

async function expandedPart(part: ContentPart, expanders: AttachmentExpanders, log: TurnDeps['log']) {
  if (part.type !== 'document' || part.source.type !== 'data') return [part]
  const mimeType = part.source.mimeType
  const expander = expanders[mimeType]
  if (expander === undefined) return [part]
  try {
    const produced = await expander({type: 'document', source: {type: 'data', mimeType, value: part.source.value}})
    return [part, ...produced.map((extra) => ({...extra, metadata: {modelOnly: true}}))]
  } catch (error) {
    log(`[chat] attachment expand failed (${mimeType}): ${String(error)}`)
    return [part, EXPAND_FAILURE_PART]
  }
}

async function expandedMessage(message: ModelMessage, deps: TurnDeps): Promise<ModelMessage> {
  if (!Array.isArray(message.content)) return message
  const parts = await Promise.all(message.content.map((part) => expandedPart(part, deps.attachmentExpanders, deps.log)))
  return {...message, content: parts.flat()}
}

function askedMessages(turn: Turn, messages: ModelMessage[], harness: HarnessAdapter): ModelMessage[] {
  if (turn.kind === 'compact') return [...messages, compactPrompt(harness)]
  if (turn.kind === 'page-queue') return [...messages, {role: 'user', content: turn.input}]
  return messages
}

function compactPrompt(harness: HarnessAdapter): ModelMessage {
  return {role: 'user', content: harness.capabilities.compaction ? '/compact' : COMPACT_FALLBACK_PROMPT}
}

async function expandedLastUser(messages: ModelMessage[], deps: TurnDeps): Promise<ModelMessage[]> {
  const lastUser = messages.findLastIndex((message) => message.role === 'user')
  const target = messages[lastUser]
  if (target === undefined) return messages
  return messages.with(lastUser, await expandedMessage(target, deps))
}

function contentParts(content: ModelMessage['content']): ContentPart[] {
  if (typeof content === 'string') return [{type: 'text', content}]
  return content ?? []
}

function withUpdate(messages: ModelMessage[], update: string): ModelMessage[] {
  const lastUser = messages.findLastIndex((message) => message.role === 'user')
  const target = messages[lastUser]
  if (update === '' || target === undefined) return messages
  return messages.with(lastUser, {
    ...target,
    content: [{type: 'text', content: update}, ...contentParts(target.content)],
  })
}

function fromLastUser(messages: ModelMessage[]): ModelMessage[] {
  return messages.slice(
    Math.max(
      messages.findLastIndex((message) => message.role === 'user'),
      0,
    ),
  )
}

function readText(message: ModelMessage | undefined): string {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(' ')
}

function isBlank(message: ModelMessage): boolean {
  const hasParts = Array.isArray(message.content) && message.content.some((part) => part.type !== 'text')
  return !hasParts && readText(message).trim() === ''
}

export function firstUserTitle(messages: readonly ModelMessage[]): string {
  return readText(messages.find((message) => message.role === 'user'))
    .trim()
    .slice(0, TITLE_MAX_CHARS)
}

async function countContextTokens(deps: TurnDeps, sessionId: SessionId): Promise<number | undefined> {
  const harness = deps.harnessFor(sessionId)
  const history = harness.history
  const row = deps.sessions.row(sessionId)
  const nativeId = row?.harnessKind === harness.id ? row.nativeId : null
  if (!history?.contextTokens || !history.transcriptPath || nativeId === null) return undefined
  const path = transcriptPathWithin(history, deps.cwd, nativeId)
  if (path === null || !existsSync(path)) return undefined
  return history.contextTokens(await readFile(path, 'utf8'))
}

async function recordContext(deps: TurnDeps, sessionId: SessionId): Promise<void> {
  const contextTokens = await countContextTokens(deps, sessionId)
  if (contextTokens !== undefined) await deps.sessions.recordContextTokens(sessionId, contextTokens)
}

export function turnHooks(
  deps: TurnDeps,
  context: {approvals: ApprovalStore; ui: UiChannel; transcripts: TranscriptImporter},
): TurnHooks {
  const normalize = toolNameNormalizer(deps.toolNames)
  return {
    plan: (turn) => {
      const sessionId = SessionId.parse(turn.threadId)
      const harness = deps.harnessFor(sessionId)
      const systemText = buildSystemText(deps.systemPrompt, harness.capabilities.systemPrompt, deps.log)
      const row = deps.sessions.row(sessionId)
      const own = ownRow(harness, row)
      const model = own?.model ?? null
      const resumeSessionId = resumableToken(deps, harness, row)
      const reset: InstructionReset = turn.kind === 'compact' || resumeSessionId === null ? 'reset' : 'keep'
      const instructions = Promise.withResolvers<PluginInstructions>()
      const toolSet = chatToolSet(deps.capabilities(sessionId), {sessionId, agentId: sessionId, model})
      const config = harness.chatConfig({
        cwd: deps.cwd,
        sessionId,
        resumeSessionId,
        model: model ?? undefined,
        effort: own?.effort ?? undefined,
        env: deps.harnessEnv?.(sessionId) ?? process.env,
        kind: turn.kind,
        hasTools: toolSet.codeMode.length + toolSet.asking.length + toolSet.direct.length > 0,
      })
      return {
        adapter: config.adapter,
        modelOptions: config.modelOptions,
        systemPrompts: async () => [systemText, (await instructions.promise).initial].filter((text) => text !== ''),
        codeMode: toolSet.codeMode,
        asking: toolSet.asking,
        direct: toolSet.direct,
        setup: async () => {
          await deps.sessions.ensure(sessionId)
          await deps.sessions.onRunStart(sessionId)
          await context.transcripts.sync(sessionId)
          const approvals = await context.approvals.forRun(sessionId)
          instructions.resolve(deps.pluginInstructions(sessionId, reset))
          return approvals
        },
        expand: async (messages) => {
          const lastUser = messages.findLast((message) => message.role === 'user')
          if (turn.kind === 'chat' && lastUser !== undefined && isBlank(lastUser)) {
            throw new Error('the message is empty')
          }
          return turn.kind === 'chat' ? expandedLastUser(messages, deps) : messages
        },
        providerMessages: async (messages) => {
          const asked = askedMessages(turn, messages, harness)
          const prepared = resumeSessionId === null ? asked : fromLastUser(asked)
          const told = withUpdate(prepared, (await instructions.promise).update)
          return config.prepareMessages?.(told) ?? told
        },
        chunk: async (chunk) => {
          const shaped = normalizedChunk(chunk, normalize)
          if (chunk.type === ChatEventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls') {
            await recordContext(deps, sessionId)
          }
          if (shaped.type === ChatEventType.TOOL_CALL_START) {
            context.ui.noteToolCall(sessionId, shaped.toolCallId, shaped.toolCallName)
          }
          const minted = mintedSessionId(shaped)
          if (minted !== null) await deps.sessions.recordNativeId(sessionId, harness.id, minted)
          const ask = readApprovalAsk(shaped)
          if (ask !== null) {
            const {toolName, ...asked} = ask
            await context.approvals.asked(sessionId, {...asked, title: toolName, runId: turn.runId})
          }
          return [shaped]
        },
      }
    },
    usage: async (turn, reported) => {
      const sessionId = SessionId.parse(turn.threadId)
      const usage = toTokenUsage(reported)
      if (usage === undefined) return
      const modelId = deps.sessions.row(sessionId)?.model ?? deps.harnessFor(sessionId).defaultModel ?? null
      await deps.sessions.recordUsage(sessionId, {
        ...tokenUsageToSnapshot(usage, modelId ?? undefined),
        ...(modelId === null ? {} : {modelId}),
      })
    },
    started: (turn) =>
      deps.sessions.publish(SessionId.parse(turn.threadId), sessionRunEvent.create({runId: turn.runId})),
    end: async (turn) => {
      const sessionId = SessionId.parse(turn.threadId)
      await context.transcripts.settle(sessionId)
      await recordContext(deps, sessionId)
      await deps.sessions.onRunEnd(sessionId)
    },
  }
}
