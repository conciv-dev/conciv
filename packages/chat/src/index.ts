import {randomUUID} from 'node:crypto'
import {and, eq, isNotNull} from 'drizzle-orm'
import {Effect} from 'effect'
import {approvalRequestedEvent, ChatEventType, sessionRunEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {type ChatMessage, type ModelMessage} from '@conciv/protocol/chat-message-types'
import {
  childCardChunks,
  createChatServer,
  drizzleChatStores,
  inSpan,
  type Tracer,
  type ChatJoin,
  type ChatSend,
  type CodeDriver,
} from '@conciv/ai/server'
import {cappedValue, type ChatHistoryWindow, type ChatHydration, type ChatPendingApproval} from '@conciv/contract'
import {chatRuns, markers, sessions, type ConcivDb} from '@conciv/db'
import {isSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {UiAnswer} from '@conciv/protocol/ui-types'
import {createUiChannel} from './approvals.js'
import {chatToolSet, type CodeCapability} from './code-mode.js'
import type {ChatTool} from '@conciv/protocol/chat-tool-types'
import type {CodeModeCatalog} from '@conciv/plugin-host'
import {clearThread, runningThreadIds} from './stores.js'
import {createTranscriptImporter, messageHarnesses, normalizedMessages, toolNameNormalizer} from './transcript.js'
import {deletedSessionError, firstUserTitle, sessionDeleted, turnHooks, type TurnDeps} from './turn.js'

export {assistCapabilities, toolDomainCapabilities, type CodeCapability, type ToolDomain} from './code-mode.js'
export type {SessionPort} from './turn.js'

const FIRST_OUTPUT_TIMEOUT_MS = 30_000
const FIRST_START_TIMEOUT_MS = 30_000

type ChatPlaneDeps = TurnDeps & {
  db: ConcivDb
  firstOutputTimeoutMs?: number
  firstStartTimeoutMs?: number
  uiCallWaitMs?: number
  uiAnswerWaitMs?: number
  groupExitTimeoutMs?: number
  driver: CodeDriver | null
  pendingPermissions: (sessionId: SessionId) => Promise<ChatPendingApproval[]>
  tracer: Tracer | undefined
  inbox: {promote: (sessionId: SessionId) => Promise<number | undefined>}
}

export type CodeTool = {
  name: string
  description: string
  inputSchema: CodeCapability['inputSchema']
  run: (input: unknown, parentToolCallId: string, signal?: AbortSignal) => Promise<unknown>
}

export type CodeSandbox = {
  capabilities: {name: string; description: string}[]
  inventory: CodeModeCatalog.Inventory
  run: (code: string, parentToolCallId: string | null, signal?: AbortSignal) => Promise<unknown>
  discover: {description: string; run: (toolNames: string[]) => Promise<unknown>} | null
  declaredCodes: ReadonlySet<string>
}

export type CodeRunner = {
  code: CodeSandbox | null
  direct: CodeTool[]
}

export type ChatPlane = {
  send: (request: ChatSend, signal?: AbortSignal) => AsyncGenerator<ChatEvent>
  join: (request: ChatJoin, signal?: AbortSignal) => AsyncGenerator<ChatEvent>
  hydrate: (sessionId: SessionId, window?: ChatHistoryWindow) => Promise<ChatHydration>
  history: (sessionId: SessionId) => Promise<ChatMessage[]>
  stop: (sessionId: SessionId, runIds?: readonly string[]) => Promise<{ok: true; stopped: boolean}>
  compact: (sessionId: SessionId) => Promise<void>
  clear: (sessionId: SessionId) => Promise<void>
  endRuns: (sessionId: SessionId) => Promise<void>
  endAllRuns: () => Promise<void>
  live: (sessionId: SessionId) => Promise<boolean>
  record: (sessionId: SessionId, chunks: readonly ChatEvent[]) => Promise<void>
  driving: (sessionId: SessionId) => boolean
  settled: (sessionId: SessionId) => Promise<void>
  recordRunError: (sessionId: SessionId, runId: string, message: string) => Promise<void>
  running: () => Promise<ReadonlySet<string>>
  answerUi: (sessionId: SessionId, toolCallId: string, value: unknown) => boolean
  askUi: (sessionId: SessionId) => Promise<UiAnswer>
  codeRunner: (
    sessionId: SessionId,
    publish: (chunk: ChatEvent) => void,
    capabilities?: readonly CodeCapability[],
  ) => Promise<CodeRunner | null>
  wake: (sessionId: SessionId) => Promise<void>
  catchUp: (sessionId: SessionId) => Promise<ChatEvent[]>
}

export async function createChatPlane(deps: ChatPlaneDeps): Promise<ChatPlane> {
  const stores = drizzleChatStores(deps.db, {
    readHarness: async (threadId) => (await deps.harnessFor(SessionId.parse(threadId))).id,
    saved: async (threadId, messages, at) => {
      if (!isSessionId(threadId)) return
      try {
        await deps.sessions.recordActivity(threadId, firstUserTitle(messages), at)
      } catch (error) {
        deps.log(`[conciv] recording the activity of session ${threadId} failed: ${String(error)}`)
      }
    },
  })
  const pendingCards = (sessionId: SessionId): Promise<ChatPendingApproval[]> => deps.pendingPermissions(sessionId)
  const ui = createUiChannel({callWaitMs: deps.uiCallWaitMs, answerWaitMs: deps.uiAnswerWaitMs})
  const transcripts = createTranscriptImporter({
    harnessFor: deps.harnessFor,
    stores,
    toolNames: deps.toolNames,
    log: deps.log,
    tracer: deps.tracer,
    native: async (sessionId) => {
      const row = await deps.sessions.row(sessionId)
      return row === null || row.nativeId === null
        ? null
        : {nativeId: row.nativeId, cwd: row.cwd, harnessKind: row.harnessKind}
    },
  })
  const server = await createChatServer({
    stores,
    sandbox: {dir: deps.cwd, groupExitTimeoutMs: deps.groupExitTimeoutMs},
    hooks: turnHooks(deps, {ui, transcripts, codeMode: deps.driver !== null}),
    codeModeResult: cappedValue,
    startTimeoutMs: deps.firstStartTimeoutMs ?? FIRST_START_TIMEOUT_MS,
    firstOutputTimeoutMs: deps.firstOutputTimeoutMs ?? FIRST_OUTPUT_TIMEOUT_MS,
    log: deps.log,
    driver: deps.driver,
    askPermission: (threadId, ask, signal) => deps.askPermission(SessionId.parse(threadId), ask, signal),
    tracer: deps.tracer,
  })

  const hydrate = (sessionId: SessionId, window?: ChatHistoryWindow): Promise<ChatHydration> =>
    inSpan(deps.tracer, 'ChatPlane.hydrate', {'conciv.session.id': sessionId}, () => hydrateSession(sessionId, window))

  const hydrateSession = async (sessionId: SessionId, window?: ChatHistoryWindow): Promise<ChatHydration> => {
    if ((await stores.runs.findActiveRun(sessionId)) === null) {
      await server.settled(sessionId)
      if (window?.before === undefined && !(await sessionDeleted(deps.sessions, sessionId)))
        await transcripts.sync(sessionId)
    }
    const thread = await server.hydrate(sessionId, window)
    const messages = normalizedMessages(thread.messages, toolNameNormalizer(await deps.toolNames(sessionId)))
    const runs = await Effect.runPromise(
      deps.db
        .select({runId: chatRuns.runId, harnessId: chatRuns.harnessId})
        .from(chatRuns)
        .where(eq(chatRuns.threadId, sessionId)),
    )
    return {
      messages,
      messageHarness: messageHarnesses(messages, Object.fromEntries(runs.map((run) => [run.runId, run.harnessId]))),
      activeRun: thread.activeRun,
      lastRun: thread.lastRun,
      pendingApprovals: await pendingCards(sessionId),
      interrupts: null,
      page: thread.page,
    }
  }

  const deliveredMessages = async (sessionId: SessionId, promoted: number | undefined): Promise<ModelMessage[]> =>
    promoted === undefined || promoted === 0 ? [] : (await stores.messages.loadThread(sessionId)).slice(-promoted)

  async function* send(request: ChatSend, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    if (!isSessionId(request.threadId) || (await stores.runs.known(request.runId))) {
      yield* server.send(request, signal)
      return
    }
    const delivered = await deliveredMessages(request.threadId, await deps.inbox.promote(request.threadId))
    yield* server.send(
      {
        ...request,
        messages: [...request.messages.slice(0, -1), ...delivered, ...request.messages.slice(-1)],
        delivered: deliveredIds(delivered),
      },
      signal,
    )
  }

  const wake = async (sessionId: SessionId): Promise<void> => {
    if (server.driving(sessionId) || (await stores.runs.findActiveRun(sessionId)) !== null) return
    const delivered = await deliveredMessages(sessionId, await deps.inbox.promote(sessionId))
    if (delivered.length === 0) return
    const runId = randomUUID()
    server
      .drive({threadId: sessionId, runId, kind: 'chat', delivered: deliveredIds(delivered)}, [])
      .catch((error: unknown) =>
        deps.log(`[chat] the run ${runId} that delivers the session inbox failed: ${String(error)}`),
      )
  }

  const endRuns = (sessionId: SessionId): Promise<void> => server.endRuns(sessionId)

  const compactSession = async (sessionId: SessionId): Promise<void> => {
    if (await sessionDeleted(deps.sessions, sessionId)) throw deletedSessionError(sessionId)
    await server.stop(sessionId)
    const {messages} = await hydrate(sessionId)
    const afterMessageId = messages.at(-1)?.id ?? null
    const marked = await Effect.runPromise(
      deps.db.transaction((tx) =>
        Effect.gen(function* () {
          const tombstone = yield* tx
            .select({id: sessions.id})
            .from(sessions)
            .where(and(eq(sessions.id, sessionId), isNotNull(sessions.deletedAt)))
          if (tombstone.length > 0) return false
          yield* tx.insert(markers).values({id: randomUUID(), sessionId, afterMessageId, kind: 'compact'})
          return true
        }),
      ),
    )
    if (!marked) throw deletedSessionError(sessionId)
    await server.drive({threadId: sessionId, runId: randomUUID(), kind: 'compact'}, [])
  }

  const buildCodeRunner = async (
    sessionId: SessionId,
    publish: (chunk: ChatEvent) => void,
    given: readonly CodeCapability[] | undefined,
  ): Promise<CodeRunner | null> => {
    const model = (await deps.sessions.row(sessionId))?.model ?? null
    const capabilities = given ?? (await deps.capabilities(sessionId))
    const toolSet = chatToolSet(capabilities, {sessionId, agentId: sessionId, model}, deps.driver !== null)
    const runner = server.codeRunner(toolSet.codeMode, toolSet.search)
    if (runner === null && toolSet.direct.length === 0) return null
    const emitter = (parentToolCallId: string | null) => (name: string, value: Record<string, unknown>) => {
      const chunk: ChatEvent = {type: ChatEventType.CUSTOM, name, value, timestamp: Date.now()}
      for (const card of childCardChunks(chunk, parentToolCallId, cappedValue) ?? [chunk]) {
        if (card.type === ChatEventType.TOOL_CALL_START) {
          ui.noteToolCall(sessionId, card.toolCallId, card.toolCallName)
        }
        publish(card)
      }
    }
    const direct = codeTools(toolSet.direct, toolSet.directed, emitter)
    const inventory = toolSet.inventory
    if (runner === null || inventory === undefined) return {code: null, direct}
    return {
      code: {
        capabilities: toolSet.codeMode.map((tool) => ({name: tool.name, description: tool.description})),
        inventory,
        run: (code, parentToolCallId, signal) => runner.run(code, emitter(parentToolCallId), signal),
        discover: runner.discover,
        declaredCodes: new Set(capabilities.flatMap((capability) => capability.errors.map(({code}) => code))),
      },
      direct,
    }
  }

  return {
    send,
    join: (request, signal) => server.join(request, signal),
    hydrate,
    history: async (sessionId) => (await hydrate(sessionId)).messages,
    stop: async (sessionId, runIds) => {
      const stopped = await server.stop(sessionId, runIds)
      return {ok: true, stopped}
    },
    compact: (sessionId) =>
      inSpan(deps.tracer, 'ChatPlane.compact', {'conciv.session.id': sessionId}, () => compactSession(sessionId)),
    clear: async (sessionId) => {
      await endRuns(sessionId)
      await clearThread(deps.db, sessionId)
    },
    endRuns,
    endAllRuns: () => server.endAllRuns(),
    live: async (sessionId) => (await stores.runs.findActiveRun(sessionId)) !== null,
    record: (sessionId, chunks) => server.record(sessionId, chunks),
    driving: (sessionId) => server.driving(sessionId),
    settled: (sessionId) => server.settled(sessionId),
    recordRunError: async (sessionId, runId, message) => {
      const run = (await stores.runs.listByThread(sessionId)).find((stored) => stored.runId === runId)
      if (run === undefined) throw new Error(`run ${runId} is not a run of session ${sessionId}`)
      await stores.runs.update(runId, {error: {message}})
    },
    running: () => runningThreadIds(deps.db),
    answerUi: (sessionId, toolCallId, value) => ui.answer(sessionId, toolCallId, value),
    askUi: (sessionId) => ui.ask(sessionId),
    catchUp: async (sessionId) => {
      const asks: ChatEvent[] = (await pendingCards(sessionId)).map(({toolName, runId: _runId, ...ask}) => ({
        ...approvalRequestedEvent.create({...ask, title: toolName}),
        timestamp: Date.now(),
      }))
      const active = await stores.runs.findActiveRun(sessionId).catch((error: unknown) => {
        deps.log(`[chat] reading the active run for a new subscriber failed: ${String(error)}`)
        return null
      })
      return active === null ? asks : [...asks, sessionRunEvent.create({runId: active.runId})]
    },
    wake: (sessionId) =>
      wake(sessionId).catch((error: unknown) =>
        deps.log(`[chat] waking session ${sessionId} for its inbox failed: ${String(error)}`),
      ),
    codeRunner: (sessionId, publish, given) =>
      inSpan(deps.tracer, 'ChatPlane.codeRunner', {'conciv.session.id': sessionId}, () =>
        buildCodeRunner(sessionId, publish, given),
      ),
  }
}

function deliveredIds(messages: readonly ModelMessage[]): string[] {
  return messages.flatMap((message) => (message.id === undefined ? [] : [message.id]))
}

type Emitter = (parentToolCallId: string | null) => (name: string, value: Record<string, unknown>) => void

function codeTools(tools: readonly ChatTool[], capabilities: readonly CodeCapability[], emitter: Emitter): CodeTool[] {
  return tools.flatMap((tool): CodeTool[] => {
    const execute = tool.execute
    const capability = capabilities.find((entry) => entry.name === tool.name)
    if (!execute || capability === undefined) return []
    return [
      {
        name: tool.name,
        description: tool.description,
        inputSchema: capability.inputSchema,
        run: async (input, parentToolCallId, signal) =>
          execute(input, {
            toolCallId: parentToolCallId,
            emitCustomEvent: emitter(parentToolCallId),
            abortSignal: signal,
          }),
      },
    ]
  })
}
