import {randomUUID} from 'node:crypto'
import {eq} from 'drizzle-orm'
import {join} from 'node:path'
import {Hono} from 'hono'
import type {UpgradeWebSocket} from '@conciv/extension/rpc-mount'
import {approvalRequestedEvent, ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {type ChatMessage} from '@conciv/protocol/chat-message-types'
import {approvalNeeded, childCardChunks, createChatServer, drizzleChatStores, toolApprovalId} from '@conciv/ai/server'
import type {ChatHistoryWindow, ChatHydration} from '@conciv/contract'
import {chatRuns, markers, type ConcivDb} from '@conciv/db'
import {CHAT_SSE_PATH, CHAT_WS_PATH, SessionId, type HubAccess} from '@conciv/protocol/chat-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import type {UiAnswer} from '@conciv/protocol/ui-types'
import {createApprovalStore, createUiChannel, type ApprovalDecision, type ApprovalScope} from './approvals.js'
import {cappedValue, chatToolSet, type CodeCapability} from './code-mode.js'
import {clearThread, runningThreadIds} from './stores.js'
import {createTranscriptImporter, messageHarnesses, normalizedMessages, toolNameNormalizer} from './transcript.js'
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

const OUTSIDE_DENIED = 'the user denied outside agents for this session'

type ChatPlaneDeps = TurnDeps & {
  db: ConcivDb
  stateRoot: string
  hubAccess: HubAccess
  firstOutputTimeoutMs?: number
}

export type CodeTool = {
  name: string
  description: string
  inputSchema: CodeCapability['inputSchema']
  run: (input: unknown, parentToolCallId: string) => Promise<unknown>
}

export type CodeRunner = {
  capabilities: {name: string; description: string}[]
  run: (code: string, parentToolCallId: string | null) => Promise<unknown>
  discover: {description: string; run: (toolNames: string[]) => Promise<unknown>} | null
  asking: CodeTool[]
  declaredCodes: ReadonlySet<string>
}

export type ChatPlane = {
  routes: (upgrade: UpgradeWebSocket) => Hono
  hydrate: (sessionId: SessionId, window?: ChatHistoryWindow) => Promise<ChatHydration>
  history: (sessionId: SessionId) => Promise<ChatMessage[]>
  stop: (sessionId: SessionId, runIds?: readonly string[]) => Promise<{ok: true}>
  compact: (sessionId: SessionId) => Promise<void>
  clear: (sessionId: SessionId) => Promise<void>
  endAllRuns: () => Promise<void>
  live: (sessionId: SessionId) => Promise<boolean>
  driving: (sessionId: SessionId) => boolean
  running: () => Promise<ReadonlySet<string>>
  decide: (
    sessionId: SessionId,
    approvalId: string,
    approved: boolean,
    scope: ApprovalScope,
  ) => Promise<ApprovalDecision | null>
  answerUi: (sessionId: SessionId, toolCallId: string, value: unknown) => boolean
  askUi: (sessionId: SessionId) => Promise<UiAnswer>
  codeRunner: (
    sessionId: SessionId,
    publish: (chunk: ChatEvent) => void,
    capabilities?: readonly CodeCapability[],
  ) => Promise<CodeRunner | null>
  admitCall: (
    sessionId: SessionId,
    toolName: string,
    input: unknown,
    publish: (chunk: ChatEvent) => void,
    title?: string,
  ) => Promise<{reason: 'asked' | 'denied' | 'missing'; message: string} | null>
  outsideDenied: (sessionId: SessionId) => Promise<boolean>
  allowOutside: (sessionId: SessionId) => Promise<void>
}

export async function createChatPlane(deps: ChatPlaneDeps): Promise<ChatPlane> {
  const stores = drizzleChatStores(deps.db, {harnessOf: (threadId) => deps.harnessFor(SessionId.parse(threadId)).id})
  const approvals = createApprovalStore(stores.metadata, deps.hubAccess)
  const ui = createUiChannel()
  const transcripts = createTranscriptImporter({
    harnessFor: deps.harnessFor,
    stores,
    claudeHome: deps.claudeHome,
    toolNames: deps.toolNames,
    log: deps.log,
    native: (sessionId) => {
      const row = deps.sessions.row(sessionId)
      return row === null || row.nativeId === null
        ? null
        : {nativeId: row.nativeId, cwd: row.cwd, harnessKind: row.harnessKind}
    },
  })
  const server = await createChatServer({
    stores,
    sandbox: {dir: deps.cwd, journalDir: join(concivStateDir(deps.stateRoot), 'runs')},
    hooks: turnHooks(deps, {approvals, ui, transcripts}),
    codeModeResult: cappedValue,
    firstOutputTimeoutMs: deps.firstOutputTimeoutMs ?? FIRST_OUTPUT_TIMEOUT_MS,
    log: deps.log,
  })
  const normalize = toolNameNormalizer(deps.toolNames)

  const admitCall: ChatPlane['admitCall'] = async (sessionId, toolName, input, publish, title = toolName) => {
    if (deps.sessions.row(sessionId) === null) {
      return {reason: 'missing', message: `session "${sessionId}" does not exist`}
    }
    const approvalId = toolApprovalId(toolName)
    const admission = await approvals.admit(sessionId, approvalId)
    if (admission === 'allowed') return null
    if (admission === 'denied') return {reason: 'denied', message: OUTSIDE_DENIED}
    await approvals.asked(sessionId, {approvalId, toolCallId: approvalId, title, input, runId: null})
    publish({...approvalRequestedEvent.create({approvalId, title, input}), timestamp: Date.now()})
    return {reason: 'asked', message: approvalNeeded(toolName).message}
  }

  const hydrate = async (sessionId: SessionId, window?: ChatHistoryWindow): Promise<ChatHydration> => {
    if ((await stores.runs.findActiveRun(sessionId)) === null) {
      await server.settled(sessionId)
      if (window?.before === undefined) await transcripts.sync(sessionId)
    }
    const thread = await server.hydrate(sessionId, window)
    const messages = normalizedMessages(thread.messages, normalize)
    const runs = await deps.db
      .select({runId: chatRuns.runId, harnessId: chatRuns.harnessId})
      .from(chatRuns)
      .where(eq(chatRuns.threadId, sessionId))
    return {
      messages,
      messageHarness: messageHarnesses(messages, Object.fromEntries(runs.map((run) => [run.runId, run.harnessId]))),
      activeRun: thread.activeRun,
      lastRun: thread.lastRun,
      pendingApprovals: await approvals.pending(sessionId),
      interrupts: null,
      page: thread.page,
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
      const {messages} = await hydrate(sessionId)
      const afterMessageId = messages.at(-1)?.id ?? null
      await deps.db.insert(markers).values({id: randomUUID(), sessionId, afterMessageId, kind: 'compact'})
      await server.drive({threadId: sessionId, runId: randomUUID(), kind: 'compact'}, [])
    },
    clear: async (sessionId) => {
      await server.endRuns(sessionId)
      clearThread(deps.db, sessionId)
    },
    endAllRuns: () => server.endAllRuns(),
    live: async (sessionId) => (await stores.runs.findActiveRun(sessionId)) !== null,
    driving: (sessionId) => server.driving(sessionId),
    running: () => runningThreadIds(deps.db),
    decide: (sessionId, approvalId, approved, scope) => approvals.decide(sessionId, approvalId, approved, scope),
    answerUi: (sessionId, toolCallId, value) => ui.answer(sessionId, toolCallId, value),
    askUi: (sessionId) => ui.ask(sessionId),
    admitCall,
    outsideDenied: (sessionId) => approvals.outsideDenied(sessionId),
    allowOutside: (sessionId) => approvals.allowOutside(sessionId),
    codeRunner: async (sessionId, publish, given) => {
      const model = deps.sessions.row(sessionId)?.model ?? null
      const capabilities = given ?? deps.capabilities(sessionId)
      const toolSet = chatToolSet(capabilities, {sessionId, model})
      const runner = server.codeRunner(toolSet.codeMode)
      if (runner === null) return null
      const emitter = (parentToolCallId: string | null) => (name: string, value: Record<string, unknown>) => {
        const chunk: ChatEvent = {type: ChatEventType.CUSTOM, name, value, timestamp: Date.now()}
        for (const card of childCardChunks(chunk, parentToolCallId, cappedValue) ?? [chunk]) {
          if (card.type === ChatEventType.TOOL_CALL_START) {
            ui.noteToolCall(sessionId, card.toolCallId, card.toolCallName)
          }
          publish(card)
        }
      }
      const asking = toolSet.asking.flatMap((tool): CodeTool[] => {
        const execute = tool.execute
        const capability = toolSet.asked.find((entry) => entry.name === tool.name)
        if (!execute || capability === undefined) return []
        return [
          {
            name: tool.name,
            description: tool.description,
            inputSchema: capability.inputSchema,
            run: async (input, parentToolCallId) => {
              const refusal = await admitCall(sessionId, tool.name, input, publish)
              if (refusal !== null) throw new Error(refusal.message)
              return execute(input, {emitCustomEvent: emitter(parentToolCallId)})
            },
          },
        ]
      })
      return {
        capabilities: toolSet.codeMode.map((tool) => ({name: tool.name, description: tool.description})),
        run: (code, parentToolCallId) => runner.run(code, emitter(parentToolCallId)),
        discover: runner.discover,
        asking,
        declaredCodes: new Set(capabilities.flatMap((capability) => capability.errors.map(({code}) => code))),
      }
    },
  }
}
