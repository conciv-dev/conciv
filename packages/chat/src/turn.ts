import {access, readFile} from 'node:fs/promises'
import {
  ChatEventType,
  SESSION_DELETED_CODE,
  sessionRunEvent,
  type ChatEvent,
  type RunLifecycle,
} from '@conciv/protocol/chat-event-types'
import {tokenUsageToSnapshot, toTokenUsage, type UsageSnapshot} from '@conciv/protocol/usage-types'
import {
  PromptPresentationSchema,
  type AttachmentDocumentPart,
  type ContentPart,
  type ModelMessage,
} from '@conciv/protocol/chat-message-types'
import type {Turn, TurnHooks} from '@conciv/ai/server'
import {foldJsonlFile, transcriptPathWithin} from '@conciv/harness'
import {isEqual, once} from 'es-toolkit'
import {
  ChatContentPartSchema,
  isHarnessSessionId,
  SessionId,
  type HarnessSessionId,
  type ReasoningEffort,
} from '@conciv/protocol/chat-types'
import type {HarnessAdapter} from '@conciv/harness'
import type {HarnessPermissionAsk, HarnessPermissionVerdict} from '@conciv/protocol/harness-types'
import type {CodeModeCatalog, PluginHooks} from '@conciv/plugin-host'
import type {UiChannel} from './approvals.js'
import {chatToolSet, type CodeCapability} from './code-mode.js'
import {normalizedChunk, toolNameNormalizer, type TranscriptImporter} from './transcript.js'

export type SessionRow = {
  model: string | null
  effort: ReasoningEffort | null
  nativeId: HarnessSessionId | null
  cwd: string
  harnessKind: string
  deletedAt: number | null
}

export type SessionPort = {
  row: (sessionId: SessionId) => Promise<SessionRow | null>
  ensure: (sessionId: SessionId) => Promise<void>
  recordNativeId: (sessionId: SessionId, harnessId: string, nativeId: HarnessSessionId) => Promise<void>
  recordUsage: (sessionId: SessionId, usage: UsageSnapshot) => Promise<void>
  recordContextTokens: (sessionId: SessionId, contextTokens: number) => Promise<void>
  recordActivity: (sessionId: SessionId, title: string, at: number) => Promise<void>
  onRunStart: (sessionId: SessionId) => Promise<void>
  onRunEnd: (sessionId: SessionId, run: RunLifecycle) => Promise<void>
  publish: (sessionId: SessionId, chunk: ChatEvent) => void
}

export type SystemPromptSources = {systemPromptFile?: string; systemPromptText?: string}

export type InstructionReset = 'keep' | 'reset'

export type PluginInstructions = {initial: string; update: string; told: () => Promise<void>}

export type SessionPrompt = PluginHooks.Domains['session']['prompt']

export type RequestHookName = 'context' | 'compaction'

export type SessionRequest = Omit<PluginHooks.Domains['session']['compaction'], 'sessionId' | 'model' | 'agent'> & {
  sessionId: SessionId
  model: {id: string; providerId: string; variant?: string}
}

type PromptFile = NonNullable<SessionPrompt['prompt']['files']>[number]

export type AttachmentExpanders = Record<string, (part: AttachmentDocumentPart) => Promise<readonly ContentPart[]>>

export type TurnDeps = {
  cwd: string
  harnessFor: (sessionId: SessionId) => Promise<HarnessAdapter>
  harnessEnv: (sessionId?: SessionId) => NodeJS.ProcessEnv
  systemPrompt: SystemPromptSources
  sessions: SessionPort
  toolNames: (sessionId: SessionId) => Promise<ReadonlySet<string>>
  capabilities: (sessionId: SessionId) => Promise<CodeCapability[]>
  attachmentExpanders: AttachmentExpanders
  prompt: (event: SessionPrompt, signal: AbortSignal) => Promise<SessionPrompt>
  promptHooked: () => Promise<boolean>
  context: (name: RequestHookName, request: SessionRequest, signal: AbortSignal) => Promise<SessionRequest>
  pluginInstructions: (
    sessionId: SessionId,
    reset: InstructionReset,
    inventory: CodeModeCatalog.Inventory | undefined,
  ) => Promise<PluginInstructions>
  log: (message: string) => void
  askPermission: (
    sessionId: SessionId,
    ask: HarnessPermissionAsk,
    signal: AbortSignal,
  ) => Promise<HarnessPermissionVerdict>
}

export const COMPACT_FALLBACK_PROMPT =
  'Summarize our conversation so far as concisely as you can: the key decisions, the current state, and any open threads, so we can continue with less context.'

const TITLE_MAX_CHARS = 120

export async function buildSystemText(
  sources: SystemPromptSources,
  mode: HarnessAdapter['capabilities']['systemPrompt'],
  log: TurnDeps['log'],
): Promise<string> {
  if (mode === 'none') return ''
  if (mode !== 'file' || sources.systemPromptFile === undefined) return sources.systemPromptText ?? ''
  try {
    return await readFile(sources.systemPromptFile, 'utf8')
  } catch (error) {
    log(`[chat] system prompt file unreadable (${sources.systemPromptFile}), using inline text: ${String(error)}`)
    return sources.systemPromptText ?? ''
  }
}

function ownRow(harness: HarnessAdapter, row: SessionRow | null): SessionRow | null {
  return row?.harnessKind === harness.id ? row : null
}

async function resumableToken(
  deps: TurnDeps,
  harness: HarnessAdapter,
  row: SessionRow | null,
): Promise<HarnessSessionId | null> {
  if (row === null || row.harnessKind !== harness.id) return null
  return livingToken(deps, harness, row.nativeId)
}

function fileExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}

async function livingToken(
  deps: TurnDeps,
  harness: HarnessAdapter,
  token: HarnessSessionId | null,
): Promise<HarnessSessionId | null> {
  if (token === null || !harness.capabilities.resume) return null
  const history = harness.history
  if (history === undefined) return token
  if (history.withinProject && !(await history.withinProject(deps.cwd, token))) return null
  if (history.transcriptPath === undefined) return token
  const path = await transcriptPathWithin(history, deps.cwd, token)
  return path !== null && (await fileExists(path)) ? token : null
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

function promptFile(part: ContentPart): PromptFile[] {
  if (part.type !== 'image' && part.type !== 'document') return []
  if (part.source.type === 'data') return [{uri: `data:${part.source.mimeType};base64,${part.source.value}`}]
  return [{uri: part.source.value}]
}

function promptEvent(sessionId: SessionId, messageId: string, message: ModelMessage): SessionPrompt {
  const parts = contentParts(message.content)
  const text = parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')
  const files = parts.flatMap(promptFile)
  return {
    sessionId,
    messageId,
    prompt: {text, ...(files.length === 0 ? {} : {files})},
    ...(message.metadata === undefined ? {} : {metadata: message.metadata}),
    delivery: 'queue',
  }
}

const DATA_URI = /^data:([^;,]+);base64,(.*)$/s

function attachmentPart(file: PromptFile): ContentPart {
  const [, mimeType, value] = DATA_URI.exec(file.uri) ?? []
  if (mimeType === undefined || value === undefined)
    throw new Error(`Unsupported attachment URI: ${file.uri.slice(0, 64)}`)
  const part: ContentPart = mimeType.startsWith('image/')
    ? {type: 'image', source: {type: 'data', mimeType, value}}
    : {type: 'document', source: {type: 'data', mimeType, value}}
  if (!ChatContentPartSchema.safeParse(part).success) throw new Error(`Invalid attachment data: ${mimeType}`)
  return part
}

function promptedMessage(message: ModelMessage, event: SessionPrompt): ModelMessage {
  const text: ContentPart[] = event.prompt.text === '' ? [] : [{type: 'text', content: event.prompt.text}]
  return {...message, content: [...text, ...(event.prompt.files ?? []).map(attachmentPart)], metadata: event.metadata}
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
    content: [{type: 'text', content: `${update}\n\n`}, ...contentParts(target.content)],
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

function titleText(message: ModelMessage | undefined): string {
  const display = PromptPresentationSchema.safeParse(message?.metadata)
  if (!display.success) return readText(message).trim()
  return display.data.displayText.trim() || display.data.comments[0]?.label.trim() || ''
}

export function firstUserTitle(messages: readonly ModelMessage[]): string {
  return titleText(messages.find((message) => message.role === 'user')).slice(0, TITLE_MAX_CHARS)
}

async function countContextTokens(deps: TurnDeps, sessionId: SessionId): Promise<number | undefined> {
  const harness = await deps.harnessFor(sessionId)
  const history = harness.history
  const row = await deps.sessions.row(sessionId)
  const nativeId = row?.harnessKind === harness.id ? row.nativeId : null
  if (!history?.contextTokens || !history.transcriptPath || nativeId === null) return undefined
  const lineTokens = history.contextTokens
  const path = await transcriptPathWithin(history, deps.cwd, nativeId)
  if (path === null || !(await fileExists(path))) return undefined
  return foldJsonlFile<number | undefined>(path, undefined, (found, line) => lineTokens(line) ?? found)
}

async function recordContext(deps: TurnDeps, sessionId: SessionId): Promise<void> {
  const contextTokens = await countContextTokens(deps, sessionId)
  if (contextTokens !== undefined) await deps.sessions.recordContextTokens(sessionId, contextTokens)
}

export async function sessionDeleted(sessions: SessionPort, sessionId: SessionId): Promise<boolean> {
  const row = await sessions.row(sessionId)
  return row !== null && row.deletedAt !== null
}

export function missingSession(sessionId: SessionId): string {
  return `session "${sessionId}" does not exist`
}

export function deletedSessionError(sessionId: SessionId): Error {
  return Object.assign(new Error(missingSession(sessionId)), {code: SESSION_DELETED_CODE})
}

export function turnHooks(
  deps: TurnDeps,
  context: {ui: UiChannel; transcripts: TranscriptImporter; codeMode: boolean},
): TurnHooks {
  return {
    admit: async (turn) => {
      const sessionId = SessionId.parse(turn.threadId)
      if (await sessionDeleted(deps.sessions, sessionId)) throw deletedSessionError(sessionId)
    },
    plan: async (turn, runSignal) => {
      const sessionId = SessionId.parse(turn.threadId)
      const harness = await deps.harnessFor(sessionId)
      const systemText = await buildSystemText(deps.systemPrompt, harness.capabilities.systemPrompt, deps.log)
      const row = await deps.sessions.row(sessionId)
      const own = ownRow(harness, row)
      const model = own?.model ?? null
      const resumeSessionId = await resumableToken(deps, harness, row)
      const reset: InstructionReset = turn.kind === 'compact' || resumeSessionId === null ? 'reset' : 'keep'
      const instructions = Promise.withResolvers<PluginInstructions>()
      const normalizer = once(async () => toolNameNormalizer(await deps.toolNames(sessionId)))
      const toolSet = async () =>
        chatToolSet(await deps.capabilities(sessionId), {sessionId, agentId: sessionId, model}, context.codeMode)
      const config = await harness.chatConfig({
        cwd: deps.cwd,
        sessionId,
        askPermission: (ask) => deps.askPermission(sessionId, ask, runSignal),
        resumeSessionId,
        model: model ?? undefined,
        effort: own?.effort ?? undefined,
        env: deps.harnessEnv(sessionId),
        kind: turn.kind,
      })
      return {
        adapter: config.adapter,
        modelOptions: config.modelOptions,
        systemPrompts: async () => [systemText, (await instructions.promise).initial].filter((text) => text !== ''),
        context: async (request, signal) => {
          const event = await deps.context(
            turn.kind === 'compact' ? 'compaction' : 'context',
            {
              sessionId,
              model: {id: config.adapter.model, providerId: harness.id, ...(own?.effort ? {variant: own.effort} : {})},
              system: request.system.map((text) => ({type: 'text', text})),
              messages: request.messages,
              options: request.options,
              tools: request.tools,
            },
            signal,
          )
          return {
            system: event.system.map((part) => part.text),
            messages: event.messages,
            options: event.options,
            tools: event.tools,
            ...(turn.kind !== 'compact' || event.result === undefined ? {} : {result: event.result}),
          }
        },
        tools: toolSet,
        setup: async () => {
          await deps.sessions.ensure(sessionId)
          await deps.sessions.onRunStart(sessionId)
          await context.transcripts.sync(sessionId)
          const {inventory} = await toolSet()
          await normalizer()
          instructions.resolve(deps.pluginInstructions(sessionId, reset, inventory))
        },
        prompt: async (message, signal) => {
          if (turn.kind !== 'chat' || message.id === undefined) return message
          if (!(await deps.promptHooked())) return message
          const event = promptEvent(sessionId, message.id, message)
          const prompted = await deps.prompt(structuredClone(event), signal)
          if (isEqual(prompted, event)) return message
          return promptedMessage(message, prompted)
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
          return (await config.prepareMessages?.(told)) ?? told
        },
        chunk: async (chunk) => {
          const shaped =
            chunk.type === ChatEventType.TOOL_CALL_START ? normalizedChunk(chunk, await normalizer()) : chunk
          if (chunk.type === ChatEventType.RUN_FINISHED) await (await instructions.promise).told()
          if (chunk.type === ChatEventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls') {
            await recordContext(deps, sessionId)
          }
          if (shaped.type === ChatEventType.TOOL_CALL_START) {
            context.ui.noteToolCall(sessionId, shaped.toolCallId, shaped.toolCallName)
          }
          const minted = mintedSessionId(shaped)
          if (minted !== null) await deps.sessions.recordNativeId(sessionId, harness.id, minted)
          return [shaped]
        },
      }
    },
    usage: async (turn, reported) => {
      const sessionId = SessionId.parse(turn.threadId)
      const usage = toTokenUsage(reported)
      if (usage === undefined) return
      const modelId =
        (await deps.sessions.row(sessionId))?.model ??
        (await (await deps.harnessFor(sessionId)).defaultModel?.()) ??
        null
      await deps.sessions.recordUsage(sessionId, {
        ...tokenUsageToSnapshot(usage, modelId ?? undefined),
        ...(modelId === null ? {} : {modelId}),
      })
    },
    started: (turn) =>
      deps.sessions.publish(SessionId.parse(turn.threadId), sessionRunEvent.create({runId: turn.runId})),
    end: async (turn, run) => {
      const sessionId = SessionId.parse(turn.threadId)
      await context.transcripts.settle(sessionId)
      await recordContext(deps, sessionId)
      await deps.sessions.onRunEnd(sessionId, run)
    },
  }
}
