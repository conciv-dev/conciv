import {randomUUID} from 'node:crypto'
import {mkdirSync, mkdtempSync, realpathSync, statSync, writeFileSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import {ConfigProvider} from 'effect'
import {rpcStream} from '@conciv/ai/client'
import {makeBrowserRpcClient, makeRpcClient, type EngineStaleness, type RpcClient} from '@conciv/contract'
import type {MakeAppOpts} from '@conciv/core/app'
import {start} from '@conciv/core/start'
import type {HarnessAdapter} from '@conciv/harness'
import {ChatEventType, runLifecycleEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {HubAccess} from '@conciv/protocol/chat-types'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import type {HarnessCommand, HarnessModel} from '@conciv/protocol/harness-types'
import {revokeBrowsers} from '@conciv/protocol/engine-trust'
import {concivStateDir} from '@conciv/protocol/state-types'
import {z} from 'zod'
import {callTool} from './call-tool.js'
import {outsideAgent, type Outside, type OutsideAgent} from './outside.js'
import {replyScript, type ReplyScript, type ScriptedHarness} from './scripted-harness.js'
import type {Gate, ModelRequest, Response} from './test-llm.js'
import {isolatedEnv} from './isolated-env.js'
import {until} from './until.js'

export * as TestLLM from './test-llm.js'
export {cli, type CliOptions, type CliRun} from './cli.js'
export type {Outside, OutsideAgent, OutsideReply} from './outside.js'

export type HarnessEngineSetting = {scope: 'project' | 'global'; namespace: string; key: string; value: unknown}

export type HarnessEngineOptions = {
  harness?: HarnessAdapter
  config?: ConcivConfig
  replies?: readonly Response[]
  files?: Record<string, string>
  settings?: HarnessEngineSetting[]
  env?: Record<string, string>
  policies?: ConcivConfig['policies']
  systemPrompt?: string
  sessionId?: string
  timeouts?: Pick<
    MakeAppOpts,
    | 'firstChunkTimeoutMs'
    | 'firstStartTimeoutMs'
    | 'eventHeartbeatIntervalMs'
    | 'stopGraceMs'
    | 'pageReplyTimeoutMs'
    | 'queuedActionTimeoutMs'
  >
  staleness?: EngineStaleness
  app?: MakeAppOpts['app']
  directory?: string
  models?: HarnessModel[]
  commands?: HarnessCommand[]
  harnesses?: ScriptedHarness[]
  fs?: {filewatcher?: boolean}
  hubAccess?: HubAccess
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

type HarnessEngineOpened = {file: string; line?: number; column?: number}

type HarnessEngineEvent = {type: string; data: unknown}

type HarnessEngineEventWait = {arrived: Promise<HarnessEngineEvent>}

type HarnessEngineRpcFailure = {type: string; message: string; data?: unknown}

type HarnessEngineRpc = {
  call: (rpcId: string, method: string, input?: unknown) => Promise<unknown>
  failure: (rpcId: string, method: string, input?: unknown) => Promise<HarnessEngineRpcFailure>
}

const PluginRpcErrorSchema = z.object({
  defined: z.literal(true),
  code: z.enum(['PLUGIN_RPC', 'PLUGIN_RPC_INTERNAL']),
  data: z.object({type: z.string(), message: z.string(), data: z.unknown().optional()}),
})

export type HarnessEngine = {
  session: HarnessEngineSession
  newSession: (title?: string) => Promise<HarnessEngineSession>
  setting: (setting: HarnessEngineSetting) => Promise<void>
  gate: () => Promise<Gate>
  requests: () => Promise<ModelRequest[]>
  address: HarnessEngineAddress
  root: string
  opened: () => Promise<HarnessEngineOpened[]>
  event: (type: string) => Promise<HarnessEngineEventWait>
  rpc: HarnessEngineRpc
  loginCode: () => Promise<string>
  revokeBrowsers: () => Promise<void>
  restart: () => Promise<void>
  outside: (agent?: OutsideAgent) => Outside
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

type Started = Awaited<ReturnType<typeof start>>

type Running = {started: Started; close: () => void}

type Boot = {
  root: string
  project: string
  harnesses: HarnessList
  options: HarnessEngineOptions
  configProvider: ConfigProvider.ConfigProvider
  opened: HarnessEngineOpened[]
}

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

async function openFirstSession(
  engine: Engine,
  settings: HarnessEngineSetting[],
  sessionId: string | undefined,
): Promise<HarnessEngineSession> {
  for (const setting of settings) await engine.rpc.settings.set(setting)
  if (sessionId !== undefined) return sessionOn(engine, sessionId)
  return newSessionOn(engine, undefined)
}

async function matching(
  events: AsyncIterable<{type: string; data: unknown}>,
  type: string,
): Promise<HarnessEngineEvent> {
  for await (const event of events) if (event.type === type) return {type: event.type, data: event.data}
  throw new Error(`the engine stopped before a ${type} event arrived`)
}

const OPENING_EVENT = 'server.connected'

async function eventWait(engine: Engine, type: string, waits: Set<AbortController>): Promise<HarnessEngineEventWait> {
  if (type === OPENING_EVENT) {
    throw new Error(
      `${OPENING_EVENT} cannot be waited for: the engine sends it once, as the first frame of each event subscription, and event() resolves once that frame has come`,
    )
  }
  const abort = new AbortController()
  waits.add(abort)
  const events = await engine.rpc.event.subscribe({types: [type]}, {signal: abort.signal}).catch((error: unknown) => {
    waits.delete(abort)
    throw error
  })
  await events.next()
  const arrived = matching(events, type)
    .catch((error: unknown) => {
      if (abort.signal.aborted) throw new Error(`the engine stopped before a ${type} event arrived`)
      throw error
    })
    .finally(() => waits.delete(abort))
  arrived.catch(() => {})
  return {arrived}
}

function rpcFailure(error: unknown): HarnessEngineRpcFailure {
  const failure = PluginRpcErrorSchema.safeParse(error)
  if (!failure.success) throw error
  const {type, message, data} = failure.data.data
  return data === undefined ? {type, message} : {type, message, data}
}

function pluginRpc(engine: Engine): HarnessEngineRpc {
  const call = (rpcId: string, method: string, input?: unknown): Promise<unknown> =>
    engine.rpc.plugin.call({rpcId, method, input})
  return {
    call,
    failure: (rpcId, method, input) =>
      call(rpcId, method, input).then((output) => {
        throw new Error(`the rpc ${rpcId}.${method} answered instead of failing: ${JSON.stringify(output)}`)
      }, rpcFailure),
  }
}

function engineHome(root: string): string {
  return join(concivStateDir(root), 'home')
}

function isolatedProvider(root: string, options: HarnessEngineOptions): ConfigProvider.ConfigProvider {
  const temporary = join(concivStateDir(root), 'tmp')
  mkdirSync(temporary, {recursive: true})
  return ConfigProvider.fromEnvRecord(
    {
      ...isolatedEnv(process.env, engineHome(root), temporary),
      ...options.env,
      ...(options.fs?.filewatcher === true ? {} : {CONCIV_DISABLE_FILEWATCHER: 'true'}),
    },
    {preserveEmptyStrings: true},
  )
}

function repeatedId(harnesses: ScriptedHarness[]): string | undefined {
  const ids = harnesses.map((harness) => harness.id)
  return ids.find((id, index) => ids.indexOf(id) !== index)
}

type HarnessList = [HarnessAdapter, ...HarnessAdapter[]]

function scriptedList(options: HarnessEngineOptions, harnesses: ScriptedHarness[], script: ReplyScript): HarnessList {
  if (options.harness !== undefined)
    throw new Error('harnesses and harness cannot be given together: harnesses are scripted')
  if (options.models !== undefined) {
    throw new Error('harnesses and models cannot be given together: give each harness its models')
  }
  if (options.commands !== undefined) {
    throw new Error('harnesses and commands cannot be given together: give each harness its commands')
  }
  const [first, ...rest] = harnesses
  if (first === undefined) throw new Error('harnesses is empty: give at least the engine harness')
  const repeated = repeatedId(harnesses)
  if (repeated !== undefined) throw new Error(`harnesses lists the id ${repeated} twice: each harness needs its own id`)
  return [script.scripted(first), ...rest.map((other) => script.scripted(other))]
}

function adapterList(options: HarnessEngineOptions, harness: HarnessAdapter, script: ReplyScript): HarnessList {
  if (options.models !== undefined) {
    throw new Error('models and harness cannot be given together: the adapter lists its own models')
  }
  if (options.commands !== undefined) {
    throw new Error('commands and harness cannot be given together: the adapter lists its own commands')
  }
  return [script.adapter(harness)]
}

function listedHarnesses(options: HarnessEngineOptions, script: ReplyScript): HarnessList {
  if (options.harnesses !== undefined) return scriptedList(options, options.harnesses, script)
  if (options.harness !== undefined) return adapterList(options, options.harness, script)
  return [script.scripted({models: options.models, commands: options.commands})]
}

function fixtureFolder(options: HarnessEngineOptions): string | undefined {
  if (options.directory === undefined) return undefined
  if (options.files !== undefined)
    throw new Error('directory and files cannot be given together: a fixture project already holds its files')
  const folder = resolve(options.directory)
  if (!statSync(folder, {throwIfNoEntry: false})?.isDirectory()) {
    throw new Error(`the directory ${folder} is not an existing folder`)
  }
  return folder
}

function openedFile(file: string, line: number | undefined, column: number | undefined): HarnessEngineOpened {
  return {file, ...(line === undefined ? {} : {line}), ...(column === undefined ? {} : {column})}
}

function bootApp(
  {root, project, harnesses: [harness, ...others], options, configProvider, opened}: Boot,
  sessionId: string | undefined,
  previous: Started | undefined,
): Promise<Started> {
  const config = options.config ?? {}
  const {staleness} = options
  const home = engineHome(root)
  return start({
    options: {
      stateRoot: root,
      harness: harness.id,
      sessionId,
      systemPrompt: options.systemPrompt,
      plugins: config.plugins,
      policies: options.policies,
      permission: config.permission,
      permissions: config.permissions,
      hubAccess: options.hubAccess,
    },
    root: project,
    harness,
    harnesses: others,
    ...options.timeouts,
    ...(staleness === undefined ? {} : {staleness: () => staleness}),
    app: options.app,
    homeDir: home,
    devEndpointDir: join(home, 'dev-endpoint'),
    configProvider,
    launchEditor: (file, line, column) => {
      opened.push(openedFile(file, line, column))
    },
    print: () => {},
    ...(previous === undefined ? {} : {port: {exact: previous.port}, accessToken: previous.agentToken}),
  })
}

function connect(engine: Engine, browser = makeBrowserRpcClient(engine.apiBase)): () => void {
  engine.rpc = browser.rpc
  engine.turns = makeTurns(browser.rpc)
  return () => {
    engine.turns.closeAll()
    browser.close()
  }
}

async function bootAgain(boot: Boot, engine: Engine, sessionId: string, running: Running): Promise<Running> {
  const started = await bootApp(boot, sessionId, running.started)
  return {started, close: connect(engine)}
}

async function closeRunning(running: Running | undefined): Promise<unknown[]> {
  if (running === undefined) return []
  running.close()
  return settleInOrder([() => running.started.stop()])
}

export async function createHarnessEngine(options: HarnessEngineOptions = {}): Promise<HarnessEngine> {
  const script = replyScript(options.replies ?? [])
  const harnesses = listedHarnesses(options, script)
  const fixture = fixtureFolder(options)
  const root = mkdtempSync(join(tmpdir(), 'conciv-kit-'))
  const project = fixture ?? root
  const opened: HarnessEngineOpened[] = []
  const removeRoot = (): Promise<void> => rm(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
  const boot: Boot = {root, project, harnesses, options, configProvider: isolatedProvider(root, options), opened}
  const first = await Promise.resolve()
    .then(() => {
      for (const [path, content] of Object.entries(options.files ?? {})) writeInside(project, path, content)
      return bootApp(boot, options.sessionId, undefined)
    })
    .catch((error: unknown) => abandonStart(error, [removeRoot]))
  const apiBase = `http://127.0.0.1:${first.port}/t/${first.agentToken}`
  const browser = makeBrowserRpcClient(apiBase)
  const engine: Engine = {apiBase, rpc: browser.rpc, turns: makeTurns(browser.rpc)}
  const state: {running: Running | undefined} = {running: {started: first, close: connect(engine, browser)}}
  const waits = new Set<AbortController>()
  const halt = async (): Promise<unknown[]> => {
    for (const wait of waits) wait.abort()
    engine.turns.closeAll()
    script.releaseGate()
    const running = state.running
    state.running = undefined
    return closeRunning(running)
  }
  const stop = async (): Promise<void> => {
    const failures = [...(await halt()), ...(await settleInOrder([removeRoot]))]
    if (failures.length > 0) throw new AggregateError(failures, 'the harness engine did not stop cleanly')
  }
  const started = await openFirstSession(engine, options.settings ?? [], first.cfg.sessionId).catch((error: unknown) =>
    abandonStart(error, [stop]),
  )
  const restart = async (): Promise<void> => {
    const running = state.running
    if (running === undefined) throw new Error('the engine is stopped: it cannot restart')
    const failures = await halt()
    if (failures.length > 0) throw new AggregateError(failures, 'the harness engine did not stop cleanly')
    state.running = await bootAgain(boot, engine, started.id, running)
  }
  return {
    session: started,
    newSession: (title) => newSessionOn(engine, title),
    setting: async (setting) => {
      await engine.rpc.settings.set(setting)
    },
    gate: async () => script.gate(),
    requests: async () => script.requests(),
    address: {apiBase, token: first.agentToken},
    root: realpathSync(project),
    opened: async () => [...opened],
    event: (type) => eventWait(engine, type, waits),
    rpc: pluginRpc(engine),
    loginCode: async () => (await makeRpcClient(apiBase).auth.issueCode()).code,
    revokeBrowsers: async () => {
      revokeBrowsers(concivStateDir(root), 'all')
    },
    restart,
    outside: (agent) => outsideAgent(apiBase, agent),
    stop,
  }
}
