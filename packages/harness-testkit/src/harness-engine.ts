import {randomUUID} from 'node:crypto'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import {ConfigProvider} from 'effect'
import {rpcStream} from '@conciv/ai/client'
import {makeBrowserRpcClient, type RpcClient} from '@conciv/contract'
import {makeApp, type MadeApp} from '@conciv/core/app'
import {resolveConfig} from '@conciv/core/config'
import type {HarnessAdapter} from '@conciv/harness'
import {ChatEventType, runLifecycleEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {serveHono} from '@conciv/serve'
import {callTool} from './call-tool.js'
import {replyScript} from './scripted-harness.js'
import type {Gate, ModelRequest, Response} from './test-llm.js'
import {isolatedEnv} from './isolated-env.js'
import {until} from './until.js'

export * as TestLLM from './test-llm.js'

export type HarnessEngineSetting = {scope: 'project' | 'global'; namespace: string; key: string; value: unknown}

export type HarnessEngineOptions = {
  harness?: HarnessAdapter
  config?: ConcivConfig
  replies?: readonly Response[]
  files?: Record<string, string>
  settings?: HarnessEngineSetting[]
  env?: Record<string, string>
}

export type HarnessEngineToolFailure = {tool: string; message: string}

export type HarnessEngineTool = {
  call: (input: unknown) => Promise<unknown>
  failure: (input: unknown) => Promise<HarnessEngineToolFailure>
}

export type HarnessEngineSession = {
  id: string
  send: (text: string) => Promise<void>
  approve: () => Promise<void>
  stop: () => Promise<void>
  tool: (name: string) => HarnessEngineTool
}

export type HarnessEngineAddress = {apiBase: string; token: string}

export type HarnessEngine = {
  session: HarnessEngineSession
  newSession: (title?: string) => Promise<HarnessEngineSession>
  setting: (setting: HarnessEngineSetting) => Promise<void>
  gate: () => Promise<Gate>
  requests: () => Promise<ModelRequest[]>
  address: HarnessEngineAddress
  stop: () => Promise<void>
}

type Step = () => unknown

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
      const abort = new AbortController()
      open.push({sessionId, runId, abort})
      const message: TurnMessage = {id: `${runId}-user`, role: 'user', parts: [{type: 'text', content: text}]}
      const events = connection.connect([message], {}, abort.signal, {threadId: sessionId, runId})
      const {promise, resolve: ended, reject} = Promise.withResolvers<void>()
      readTurn(events, runId, ended, reject).catch(reject)
      return promise
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

async function asSession(engine: Engine, sessionId: string, use: (rpc: RpcClient) => Promise<void>): Promise<void> {
  const browser = makeBrowserRpcClient(engine.apiBase, {session: () => sessionId})
  try {
    await use(browser.rpc)
  } finally {
    browser.close()
  }
}

function approvePending(engine: Engine, sessionId: string): Promise<void> {
  return asSession(engine, sessionId, async (rpc) => {
    const pending = (): Promise<string[]> =>
      rpc.chat.hydrate({sessionId}).then(({pendingApprovals}) => pendingApprovals.map((ask) => ask.approvalId))
    await until(async () => (await pending()).length > 0)
    for (const approvalId of await pending()) await rpc.chat.permissionDecision({approvalId, reply: 'once'})
  })
}

function stopRun(engine: Engine, sessionId: string): Promise<void> {
  return asSession(engine, sessionId, async (rpc) => {
    const {activeRun} = await rpc.chat.hydrate({sessionId})
    const runIds = engine.turns.runIds(sessionId)
    await rpc.chat.stop({sessionId, runIds: activeRun === null ? runIds : [activeRun.runId, ...runIds]})
  })
}

function sessionOn(engine: Engine, id: string): HarnessEngineSession {
  return {
    id,
    send: (text) => engine.turns.send(id, text),
    approve: () => approvePending(engine, id),
    stop: () => stopRun(engine, id),
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

async function openFirstSession(engine: Engine, settings: HarnessEngineSetting[]): Promise<HarnessEngineSession> {
  for (const setting of settings) await engine.rpc.settings.set(setting)
  return newSessionOn(engine, undefined)
}

function engineHome(root: string): string {
  return join(concivStateDir(root), 'home')
}

function isolatedProvider(root: string, env: Record<string, string>): ConfigProvider.ConfigProvider {
  const temporary = join(concivStateDir(root), 'tmp')
  mkdirSync(temporary, {recursive: true})
  return ConfigProvider.fromEnvRecord(
    {...isolatedEnv(process.env, engineHome(root), temporary), ...env, CONCIV_DISABLE_FILEWATCHER: 'true'},
    {preserveEmptyStrings: true},
  )
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
    home: engineHome(root),
    configProvider,
  })
  await app.awaitActivation().catch((error: unknown) => abandonStart(error, [() => app.dispose()]))
  return app
}

export async function createHarnessEngine(options: HarnessEngineOptions = {}): Promise<HarnessEngine> {
  const script = replyScript(options.replies ?? [])
  const harness = script.harness(options.harness)
  const root = mkdtempSync(join(tmpdir(), 'conciv-kit-'))
  const removeRoot = (): Promise<void> => rm(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
  const app = await Promise.resolve()
    .then(() => bootApp(root, harness, options, isolatedProvider(root, options.env ?? {})))
    .catch((error: unknown) => abandonStart(error, [removeRoot]))
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
    setting: async (setting) => {
      await engine.rpc.settings.set(setting)
    },
    gate: async () => script.gate(),
    requests: async () => script.requests(),
    address: {apiBase, token: app.agentToken},
    stop,
  }
}
