import {randomUUID} from 'node:crypto'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import {ConfigProvider} from 'effect'
import {rpcStream} from '@conciv/ai/client'
import {makeBrowserRpcClient, type RpcClient, type SessionMeta} from '@conciv/contract'
import {makeApp, type MadeApp} from '@conciv/core/app'
import {resolveConfig} from '@conciv/core/config'
import type {HarnessAdapter} from '@conciv/harness'
import type {HarnessListCursor} from '@conciv/protocol/harness-types'
import {ChatEventType, runLifecycleEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {PermissionReply, ReasoningEffort} from '@conciv/protocol/chat-types'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {serveHono} from '@conciv/serve'
import {callTool} from './call-tool.js'
import {replyScript} from './scripted-harness.js'
import type {Gate, RecordedRequest, Responder, Response} from './test-llm.js'
import {until} from './until.js'

export * as TestLLM from './test-llm.js'

export type HarnessEngineSetting = {scope: 'project' | 'global'; namespace: string; key: string; value: unknown}

export type HarnessEngineOptions = {
  harness?: HarnessAdapter
  config?: ConcivConfig
  replies?: readonly Response[]
  fallback?: Response
  files?: Record<string, string>
  settings?: HarnessEngineSetting[]
}

export type HarnessEngineToolFailure = {tool: string; message: string}

export type HarnessEngineTool = {
  call: (input: unknown) => Promise<unknown>
  failure: (input: unknown) => Promise<HarnessEngineToolFailure>
}

export type HarnessEngineSession = {
  id: string
  send: (text: string) => Promise<void>
  approve: (reply?: PermissionReply) => Promise<void>
  stop: () => Promise<void>
  messages: () => Promise<ChatMessage[]>
  rename: (title: string) => Promise<void>
  compact: () => Promise<void>
  model: (id: string) => Promise<void>
  effort: (level: ReasoningEffort | null) => Promise<void>
  remove: () => Promise<void>
  tool: (name: string) => HarnessEngineTool
}

export type HarnessEngineAddress = {apiBase: string; token: string}

export type HarnessEngine = {
  session: HarnessEngineSession
  newSession: (title?: string) => Promise<HarnessEngineSession>
  sessionById: (id: string) => HarnessEngineSession
  sessions: () => Promise<SessionMeta[]>
  setting: (setting: HarnessEngineSetting) => Promise<void>
  gate: () => Promise<Gate>
  requests: () => Promise<RecordedRequest[]>
  push: (...replies: readonly Response[]) => Promise<void>
  always: (reply: Response) => Promise<void>
  serve: (responder: Responder) => Promise<void>
  wait: (count: number) => Promise<void>
  address: HarnessEngineAddress
  stop: () => Promise<void>
}

type Step = () => unknown

const SESSION_PAGE_SIZE = 100

type TurnMessage = {id: string; role: 'user'; parts: ChatMessage['parts']}

type OpenTurn = {sessionId: string; runId: string; abort: AbortController}

type Turns = {
  send: (sessionId: string, text: string) => Promise<void>
  runIds: (sessionId: string) => string[]
  closeAll: () => void
}

type Engine = {rpc: RpcClient; apiBase: string; turns: Turns}

async function settleInOrder(steps: Step[]): Promise<unknown[]> {
  const failures: unknown[] = []
  for (const step of steps) {
    const [outcome] = await Promise.allSettled([Promise.resolve().then(step)])
    if (outcome?.status === 'rejected') failures.push(outcome.reason)
  }
  return failures
}

async function abandonStart(error: unknown, steps: Step[]): Promise<never> {
  const failures = await settleInOrder(steps)
  if (failures.length === 0) throw error
  throw new AggregateError([error, ...failures], 'the harness engine did not start')
}

function writeInside(root: string, path: string, content: string): void {
  const target = resolve(root, path)
  const inside = relative(root, target)
  if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`the project file ${path} resolves outside the project root ${root}`)
  }
  mkdirSync(dirname(target), {recursive: true})
  writeFileSync(target, content)
}

async function* streamed(opened: Promise<AsyncIterable<ChatEvent>>): AsyncGenerator<ChatEvent> {
  yield* await opened
}

function endsRun(event: ChatEvent, runId: string): boolean {
  if (event.type === ChatEventType.RUN_FINISHED) return event.finishReason !== 'tool_calls'
  const lifecycle = runLifecycleEvent.parse(event)
  return lifecycle?.phase === 'aborted' && lifecycle.runId === runId
}

async function readTurn(
  events: AsyncIterable<ChatEvent>,
  runId: string,
  ended: () => void,
  failed: (error: Error) => void,
): Promise<void> {
  for await (const event of events) {
    if (event.type === ChatEventType.RUN_ERROR) failed(new Error(event.message))
    else if (endsRun(event, runId)) ended()
  }
  ended()
}

function makeTurns(rpc: RpcClient): Turns {
  const open: OpenTurn[] = []
  const connection = rpcStream((_messages, _data, signal, input) =>
    streamed(rpc.chat.send({sessionId: input.threadId, runId: input.runId, messages: input.messages}, {signal})),
  )
  return {
    send: (sessionId, text) => {
      const runId = randomUUID()
      const turn: OpenTurn = {sessionId, runId, abort: new AbortController()}
      open.push(turn)
      const message: TurnMessage = {id: `${runId}-user`, role: 'user', parts: [{type: 'text', content: text}]}
      const events = connection.connect([message], {}, turn.abort.signal, {threadId: sessionId, runId})
      const {promise, resolve: ended, reject} = Promise.withResolvers<void>()
      readTurn(events, runId, ended, reject).catch(reject)
      return promise.finally(() => {
        open.splice(open.indexOf(turn), 1)
      })
    },
    runIds: (sessionId) => open.filter((turn) => turn.sessionId === sessionId).map((turn) => turn.runId),
    closeAll: () => {
      for (const turn of open.splice(0)) turn.abort.abort()
    },
  }
}

function failedTool(name: string, call: Promise<unknown>): Promise<HarnessEngineToolFailure> {
  return call.then(
    (output) => {
      throw new Error(`the tool ${name} answered instead of failing: ${JSON.stringify(output)}`)
    },
    (error: unknown) => ({tool: name, message: error instanceof Error ? error.message : String(error)}),
  )
}

async function asSession<Result>(
  engine: Engine,
  sessionId: string,
  use: (rpc: RpcClient) => Promise<Result>,
): Promise<Result> {
  const browser = makeBrowserRpcClient(engine.apiBase, {session: () => sessionId})
  try {
    return await use(browser.rpc)
  } finally {
    browser.close()
  }
}

function approvePending(engine: Engine, sessionId: string, reply: PermissionReply): Promise<void> {
  return asSession(engine, sessionId, async (rpc) => {
    const pending = (): Promise<string[]> =>
      rpc.chat.hydrate({sessionId}).then(({pendingApprovals}) => pendingApprovals.map((ask) => ask.approvalId))
    await until(async () => (await pending()).length > 0)
    for (const approvalId of await pending()) await rpc.chat.permissionDecision({approvalId, reply})
  })
}

function stopRun(engine: Engine, sessionId: string): Promise<void> {
  return asSession(engine, sessionId, async (rpc) => {
    const {activeRun} = await rpc.chat.hydrate({sessionId})
    const runIds = engine.turns.runIds(sessionId)
    await rpc.chat.stop({sessionId, runIds: activeRun === null ? runIds : [activeRun.runId, ...runIds]})
  })
}

function asSessionDone(engine: Engine, sessionId: string, use: (rpc: RpcClient) => Promise<unknown>): Promise<void> {
  return asSession(engine, sessionId, async (rpc) => {
    await use(rpc)
  })
}

function sessionOn(engine: Engine, id: string): HarnessEngineSession {
  return {
    id,
    send: (text) => engine.turns.send(id, text),
    approve: (reply = 'once') => approvePending(engine, id, reply),
    stop: () => stopRun(engine, id),
    messages: () => asSession(engine, id, async (rpc) => (await rpc.chat.hydrate({sessionId: id})).messages),
    rename: (title) => asSessionDone(engine, id, (rpc) => rpc.sessions.rename({sessionId: id, title})),
    compact: () => asSessionDone(engine, id, (rpc) => rpc.sessions.compact({sessionId: id})),
    model: (model) => asSessionDone(engine, id, (rpc) => rpc.sessions.model({sessionId: id, model})),
    effort: (effort) => asSessionDone(engine, id, (rpc) => rpc.sessions.effort({sessionId: id, effort})),
    remove: () => asSessionDone(engine, id, (rpc) => rpc.sessions.delete({sessionId: id})),
    tool: (name) => ({
      call: (input) => callTool(engine.apiBase, id, name, input),
      failure: (input) => failedTool(name, callTool(engine.apiBase, id, name, input)),
    }),
  }
}

async function newSessionOn(engine: Engine, title: string | undefined): Promise<HarnessEngineSession> {
  const {sessionId} = await engine.rpc.sessions.create()
  if (title !== undefined) await engine.rpc.sessions.rename({sessionId, title})
  return sessionOn(engine, sessionId)
}

async function listSessions(
  rpc: RpcClient,
  cursor: HarnessListCursor | null,
  listed: SessionMeta[],
): Promise<SessionMeta[]> {
  const page = await rpc.sessions.list({cursor, limit: SESSION_PAGE_SIZE})
  const all = [...listed, ...page.sessions]
  if (page.next === null) return all
  return listSessions(rpc, page.next, all)
}

async function openFirstSession(engine: Engine, settings: HarnessEngineSetting[]): Promise<HarnessEngineSession> {
  for (const setting of settings) await engine.rpc.settings.set(setting)
  return newSessionOn(engine, undefined)
}

async function bootApp(
  root: string,
  harness: HarnessAdapter,
  options: HarnessEngineOptions,
  configProvider: ConfigProvider.ConfigProvider,
): Promise<MadeApp> {
  const config = options.config ?? {}
  for (const [path, content] of Object.entries(options.files ?? {})) writeInside(root, path, content)
  const app = await makeApp({
    print: () => {},
    cfg: {
      enabled: true,
      stateRoot: root,
      harness: harness.id,
      sessionId: undefined,
      harnessSessionId: undefined,
      systemPrompt: '',
      hubAccess: 'project',
      plugins: config.plugins ?? [],
      policies: [],
      permissions: resolveConfig({permission: config.permission, permissions: config.permissions}, root, configProvider)
        .permissions,
    },
    cwd: root,
    openInEditor: () => {},
    harness,
    harnesses: [],
    home: join(concivStateDir(root), 'home'),
    configProvider,
  })
  await app.awaitActivation().catch((error: unknown) => abandonStart(error, [() => app.dispose()]))
  return app
}

export async function createHarnessEngine(options: HarnessEngineOptions = {}): Promise<HarnessEngine> {
  const script = replyScript(options.replies ?? [], options.fallback)
  const harness = script.harness(options.harness)
  const configProvider = ConfigProvider.fromEnvRecord(
    {...process.env, CONCIV_DISABLE_FILEWATCHER: 'true'},
    {preserveEmptyStrings: true},
  )
  const root = mkdtempSync(join(tmpdir(), 'conciv-kit-'))
  const removeRoot = (): Promise<void> => rm(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
  const app = await bootApp(root, harness, options, configProvider).catch((error: unknown) =>
    abandonStart(error, [removeRoot]),
  )
  const served = await serveHono({fetch: app.fetch}).catch((error: unknown) =>
    abandonStart(error, [() => app.dispose(), removeRoot]),
  )
  const apiBase = `http://127.0.0.1:${served.port}/t/${app.agentToken}`
  const browser = makeBrowserRpcClient(apiBase)
  const engine: Engine = {rpc: browser.rpc, apiBase, turns: makeTurns(browser.rpc)}
  const stop = async (): Promise<void> => {
    script.releaseGate()
    engine.turns.closeAll()
    browser.close()
    const failures = await settleInOrder([() => served.close(), () => app.dispose(), removeRoot])
    if (failures.length > 0) throw new AggregateError(failures, 'the harness engine did not stop cleanly')
  }
  const started = await openFirstSession(engine, options.settings ?? []).catch((error: unknown) =>
    abandonStart(error, [stop]),
  )
  return {
    session: started,
    newSession: (title) => newSessionOn(engine, title),
    sessionById: (id) => sessionOn(engine, id),
    sessions: () => listSessions(engine.rpc, null, []),
    setting: async (setting) => {
      await engine.rpc.settings.set(setting)
    },
    gate: async () => script.gate(),
    requests: async () => script.requests(),
    push: async (...replies) => script.push(...replies),
    always: async (reply) => script.always(reply),
    serve: async (responder) => script.serve(responder),
    wait: (count) => script.wait(count),
    address: {apiBase, token: app.agentToken},
    stop,
  }
}
