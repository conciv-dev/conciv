import {randomUUID} from 'node:crypto'
import {join} from 'node:path'
import {Hono} from 'hono'
import type {UpgradeWebSocket} from 'hono/ws'
import {approvalAskOf, ChatEventType, type ChatEvent, type ChatMessage} from '@conciv/ai'
import {childCardChunks, createChatServer, drizzleChatStores, type CommandRules} from '@conciv/ai/server'
import type {ChatHydration} from '@conciv/contract'
import {markers, type ConcivDb} from '@conciv/db'
import {CHAT_SSE_PATH, CHAT_WS_PATH, type SessionId} from '@conciv/protocol/chat-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {UiAnswer} from '@conciv/protocol/ui-types'
import {createApprovalStore, createUiChannel, type ApprovalScope} from './approvals.js'
import {cappedValue, chatToolSet, type CodeCapability} from './code-mode.js'
import {clearThread, runningThreadIds} from './stores.js'
import {createTranscriptImporter, normalizedMessages, toolNameNormalizer} from './transcript.js'
import {turnHooks, type TurnDeps} from './turn.js'

export {
  assistCapabilities,
  cappedText,
  cappedValue,
  RESULT_CAP_CHARS,
  registryCapabilities,
  safeStringify,
  truncationEnvelope,
  type CodeCapability,
} from './code-mode.js'
export type {AttachmentExpanders, SessionPort} from './turn.js'

const FIRST_OUTPUT_TIMEOUT_MS = 30_000

type ChatPlaneDeps = TurnDeps & {
  db: ConcivDb
  stateRoot: string
  commands: CommandRules
  firstOutputTimeoutMs?: number
}

export type CodeTool = {
  name: string
  description: string
  inputSchema: CodeCapability['inputSchema']
  run: (input: unknown, parentToolCallId: string) => Promise<unknown>
}

export type CodeRunner = {
  systemPrompt: string
  run: (code: string, parentToolCallId: string) => Promise<unknown>
  discover: {description: string; run: (toolNames: string[]) => Promise<unknown>} | null
  asking: CodeTool[]
  declaredCodes: ReadonlySet<string>
}

export type ChatPlane = {
  routes: (upgrade: UpgradeWebSocket) => Hono
  hydrate: (sessionId: SessionId) => Promise<ChatHydration>
  history: (sessionId: SessionId) => Promise<ChatMessage[]>
  stop: (sessionId: SessionId, runIds?: readonly string[]) => Promise<{ok: true}>
  compact: (sessionId: SessionId) => Promise<void>
  clear: (sessionId: SessionId) => Promise<void>
  live: (sessionId: SessionId) => Promise<boolean>
  running: () => Promise<ReadonlySet<string>>
  decide: (sessionId: SessionId, approvalId: string, approved: boolean, scope: ApprovalScope) => Promise<boolean>
  answerUi: (sessionId: SessionId, toolCallId: string, value: unknown) => boolean
  askUi: (sessionId: SessionId) => Promise<UiAnswer>
  codeRunner: (sessionId: SessionId, publish: (chunk: ChatEvent) => void) => Promise<CodeRunner | null>
}

export async function createChatPlane(deps: ChatPlaneDeps): Promise<ChatPlane> {
  const stores = drizzleChatStores(deps.db)
  const approvals = createApprovalStore(stores.metadata)
  const ui = createUiChannel()
  const transcripts = createTranscriptImporter({
    harness: deps.harness,
    stores,
    claudeHome: deps.claudeHome,
    toolNames: deps.toolNames,
    log: deps.log,
    native: (sessionId) => {
      const row = deps.sessions.row(sessionId)
      return row === null || row.nativeId === null ? null : {nativeId: row.nativeId, cwd: row.cwd}
    },
  })
  const server = await createChatServer({
    stores,
    sandbox: {dir: deps.cwd, journalDir: join(concivStateDir(deps.stateRoot), 'runs'), commands: deps.commands},
    hooks: turnHooks(deps, {approvals, ui, transcripts}),
    codeModeResult: cappedValue,
    firstOutputTimeoutMs: deps.firstOutputTimeoutMs ?? FIRST_OUTPUT_TIMEOUT_MS,
    log: deps.log,
  })
  const normalize = toolNameNormalizer(deps.toolNames)

  const hydrate = async (sessionId: SessionId): Promise<ChatHydration> => {
    if ((await stores.runs.findActiveRun(sessionId)) === null) await transcripts.sync(sessionId)
    const thread = await server.hydrate(sessionId)
    return {
      messages: normalizedMessages(thread.messages, normalize),
      activeRun: thread.activeRun,
      lastRun: thread.lastRun,
      pendingApprovals: await approvals.pending(sessionId),
      interrupts: null,
    }
  }

  return {
    routes: (upgrade) =>
      new Hono()
        .get(
          CHAT_WS_PATH,
          upgrade((c) => {
            const socket = server.socket(c.req.raw)
            return {
              onOpen: (_event, ws) =>
                socket.open({send: (data) => ws.send(data), close: (code, reason) => ws.close(code, reason)}),
              onMessage: (event) => socket.message(event.data),
              onClose: () => socket.close(),
              onError: () => socket.close(),
            }
          }),
        )
        .post(CHAT_SSE_PATH, (c) => server.events(c.req.raw))
        .get(CHAT_SSE_PATH, (c) => server.resume(c.req.raw) ?? c.json({message: 'no resume offset'}, 400)),
    hydrate,
    history: async (sessionId) => (await hydrate(sessionId)).messages,
    stop: async (sessionId, runIds) => {
      await server.stop(sessionId, runIds)
      return {ok: true}
    },
    compact: async (sessionId) => {
      await server.stop(sessionId)
      const {messages} = await server.hydrate(sessionId)
      await deps.db.insert(markers).values({id: randomUUID(), sessionId, afterTurn: messages.length, kind: 'compact'})
      await server.drive({threadId: sessionId, runId: randomUUID(), kind: 'compact'}, [])
    },
    clear: async (sessionId) => {
      await server.endRuns(sessionId)
      clearThread(deps.db, sessionId)
    },
    live: async (sessionId) => (await stores.runs.findActiveRun(sessionId)) !== null,
    running: () => runningThreadIds(deps.db),
    decide: (sessionId, approvalId, approved, scope) => approvals.decide(sessionId, approvalId, approved, scope),
    answerUi: (sessionId, toolCallId, value) => ui.answer(sessionId, toolCallId, value),
    askUi: (sessionId) => ui.ask(sessionId),
    codeRunner: async (sessionId, publish) => {
      const model = deps.sessions.row(sessionId)?.model ?? null
      const capabilities = deps.capabilities(sessionId)
      const toolSet = chatToolSet(capabilities, {sessionId, model})
      const runner = server.codeRunner(toolSet.codeMode, toolSet.asking, await approvals.granted(sessionId))
      if (runner === null) return null
      const emitter = (parentToolCallId: string) => (name: string, value: Record<string, unknown>) => {
        const chunk: ChatEvent = {type: ChatEventType.CUSTOM, name, value, timestamp: Date.now()}
        const ask = approvalAskOf(chunk)
        if (ask !== null) {
          const asked = {
            approvalId: ask.approvalId,
            toolCallId: ask.toolCallId,
            title: ask.toolName,
            input: ask.input,
            runId: null,
          }
          void approvals.asked(sessionId, asked).catch((error: unknown) => {
            deps.log(`[chat] recording the approval ask ${ask.approvalId} failed: ${String(error)}`)
          })
        }
        for (const card of childCardChunks(chunk, parentToolCallId, cappedValue) ?? [chunk]) {
          if (card.type === ChatEventType.TOOL_CALL_START) {
            ui.noteToolCall(sessionId, card.toolCallId, card.toolCallName)
          }
          publish(card)
        }
      }
      const asking = runner.asking.flatMap((tool): CodeTool[] => {
        const execute = tool.execute
        const capability = toolSet.asked.find((entry) => entry.name === tool.name)
        if (!execute || capability === undefined) return []
        return [
          {
            name: tool.name,
            description: tool.description,
            inputSchema: capability.inputSchema,
            run: (input, parentToolCallId) =>
              Promise.resolve(execute(input, {emitCustomEvent: emitter(parentToolCallId)})),
          },
        ]
      })
      return {
        systemPrompt: runner.systemPrompt,
        run: (code, parentToolCallId) => runner.run(code, emitter(parentToolCallId)),
        discover: runner.discover,
        asking,
        declaredCodes: new Set(capabilities.flatMap((capability) => capability.errors.map(({code}) => code))),
      }
    },
  }
}
