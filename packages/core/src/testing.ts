import {randomUUID} from 'node:crypto'
import {mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import {ConfigProvider} from 'effect'
import {isMatch} from 'es-toolkit/compat'
import {rpcStream} from '@conciv/ai/client'
import {readFinishReason} from '@conciv/ai/server'
import {makeBrowserRpcClient, makeRpcClient, type EngineStaleness, type RpcClient} from '@conciv/contract'
import {start, type StartOpts} from './start.js'
import type {HarnessAdapter} from '@conciv/harness'
import {ChatEventType, runLifecycleEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {ConcivConfigSchema, type ConcivConfig} from '@conciv/protocol/config-types'
import {CONNECT_FIRST_PORT, CONNECT_LAST_PORT} from '@conciv/protocol/connect-ports'
import {revokeBrowsers} from '@conciv/protocol/engine-trust'
import {concivStateDir} from '@conciv/protocol/state-types'
import {z} from 'zod'
import {onTestFinished} from 'vitest'
import {
  commitAll,
  holdTestClock,
  initGitProject,
  outsideAgent,
  realClock,
  replyScript,
  toolClients,
  until,
  type Gate,
  type HarnessEngineClock,
  type HeldClock,
  type ModelRequest,
  type Outside,
  type OutsideAgent,
  type Reply,
  type ReplyScript,
  type ScriptedHarness,
  type ToolClients,
} from '@conciv/harness-testkit'
import {isolatedEnv} from '@conciv/vitest-config/isolated-env'

export {TestLLM} from '@conciv/harness-testkit'
export type {
  HarnessEngineClock,
  Outside,
  OutsideAgent,
  OutsideReply,
  ScriptedHarness,
  ScriptedSession,
} from '@conciv/harness-testkit'

export type HarnessEngineSetting = {scope: 'project' | 'global'; namespace: string; key: string; value: unknown}

export type EngineStart = {
  directory?: string
  timeouts?: Partial<
    Pick<
      StartOpts,
      | 'firstChunkTimeoutMs'
      | 'firstStartTimeoutMs'
      | 'uiCallWaitMs'
      | 'uiAnswerWaitMs'
      | 'eventHeartbeatIntervalMs'
      | 'stopGraceMs'
    >
  >
  harnesses?: ScriptedHarness[]
  env?: Record<string, string>
  fs?: {filewatcher?: boolean}
  clock?: 'test'
  port?: 'connect'
  token?: string
  tokensPerSecond?: number
  home?: string
  git?: boolean
}

export type HarnessEngineStart = EngineStart & {harness?: HarnessAdapter}

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

type HarnessEngineEventMatch = {data: object}

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

const AddressInUseSchema = z.object({code: z.literal('EADDRINUSE')})

export type HarnessEngine = {
  session: HarnessEngineSession
  newSession: (title?: string) => Promise<HarnessEngineSession>
  setting: (setting: HarnessEngineSetting) => Promise<void>
  gate: () => Promise<Gate>
  requests: () => Promise<ModelRequest[]>
  address: HarnessEngineAddress
  root: string
  home: string
  opened: () => Promise<HarnessEngineOpened[]>
  event: (type: string, match?: HarnessEngineEventMatch) => Promise<HarnessEngineEventWait>
  rpc: HarnessEngineRpc
  loginCode: () => Promise<string>
  revokeBrowsers: () => Promise<void>
  restart: () => Promise<void>
  clock: HarnessEngineClock
  outside: (agent?: OutsideAgent) => Outside
  reply: (...replies: Reply[]) => Promise<void>
  stale: (staleness: EngineStaleness) => Promise<void>
  version: (version: string) => Promise<void>
  write: (path: string, content: string) => Promise<void>
  commit: (message: string) => Promise<void>
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

type Engine = {rpc: RpcClient; apiBase: string; token: string; turns: Turns; tools: ToolClients}

type Started = Awaited<ReturnType<typeof start>>

type Running = {started: Started; close: () => void}

type Live = {staleness: EngineStaleness | undefined; version: string | undefined}

type Boot = {
  root: string
  project: string
  harnesses: HarnessList
  config: ConcivConfig
  options: HarnessEngineStart
  configProvider: ConfigProvider.ConfigProvider
  opened: HarnessEngineOpened[]
  live: Live
  heldClock: HeldClock | undefined
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
  if (event.type === ChatEventType.RUN_FINISHED) return readFinishReason(event) !== 'tool_calls'
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
    if (event.type === ChatEventType.RUN_ERROR) failed(Object.assign(new Error(event.message), {code: event.code}))
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
  const browser = makeBrowserRpcClient(engine.apiBase, {token: engine.token, session: () => sessionId})
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
    const runIds = engine.turns.runIds(sessionId)
    if (runIds.length > 0) {
      await rpc.chat.stop({sessionId, runIds})
      return
    }
    const {activeRun} = await rpc.chat.hydrate({sessionId})
    await rpc.chat.stop({sessionId, runIds: activeRun === null ? [] : [activeRun.runId]})
  })
}

function sessionOn(engine: Engine, id: string): HarnessEngineSession {
  return {
    id,
    send: (text) => engine.turns.send(id, text),
    approve: () => approvePending(engine, id),
    stop: () => stopRun(engine, id),
    tool: (name) => ({
      call: (input) => engine.tools.call(id, name, input),
      failure: (input) => failedTool(name, engine.tools.call(id, name, input)),
    }),
  }
}

async function newSessionOn(engine: Engine, title: string | undefined): Promise<HarnessEngineSession> {
  const {sessionId} = await engine.rpc.sessions.create()
  if (title !== undefined) await engine.rpc.sessions.rename({sessionId, title})
  return sessionOn(engine, sessionId)
}

async function openFirstSession(engine: Engine, sessionId: string | undefined): Promise<HarnessEngineSession> {
  if (sessionId !== undefined) return sessionOn(engine, sessionId)
  return newSessionOn(engine, undefined)
}

function matches(data: unknown, match: HarnessEngineEventMatch | undefined): boolean {
  if (match === undefined) return true
  return typeof data === 'object' && data !== null && isMatch(data, match.data)
}

async function matching(
  events: AsyncIterable<{type: string; data: unknown}>,
  type: string,
  match: HarnessEngineEventMatch | undefined,
): Promise<HarnessEngineEvent> {
  for await (const event of events) {
    if (event.type === type && matches(event.data, match)) {
      return {type: event.type, data: event.data}
    }
  }
  throw new Error(`the engine stopped before a ${type} event arrived`)
}

const OPENING_EVENT = 'server.connected'

type OpenWait = {pause: () => void; renew: () => Promise<void>; end: () => void}

async function eventWait(
  engine: Engine,
  type: string,
  match: HarnessEngineEventMatch | undefined,
  waits: Set<OpenWait>,
): Promise<HarnessEngineEventWait> {
  if (type === OPENING_EVENT) {
    throw new Error(
      `${OPENING_EVENT} cannot be waited for: the engine sends it once, as the first frame of each event subscription, and event() resolves once that frame has come`,
    )
  }
  const found = Promise.withResolvers<HarnessEngineEvent>()
  const current = {abort: new AbortController()}
  const listen = async (): Promise<void> => {
    const abort = new AbortController()
    current.abort = abort
    const events = await engine.rpc.event.subscribe({types: [type]}, {signal: abort.signal})
    await events.next()
    matching(events, type, match).then(found.resolve, (error: unknown) => {
      if (!abort.signal.aborted) found.reject(error)
    })
  }
  const stopped = (): Error => new Error(`the engine stopped before a ${type} event arrived`)
  const open: OpenWait = {
    pause: () => current.abort.abort(),
    renew: () => listen().catch((error: unknown) => found.reject(error)),
    end: () => {
      current.abort.abort()
      found.reject(stopped())
    },
  }
  waits.add(open)
  await listen().catch((error: unknown) => {
    waits.delete(open)
    throw error
  })
  const arrived = found.promise.finally(() => {
    waits.delete(open)
    current.abort.abort()
  })
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

function engineHome(root: string, options: HarnessEngineStart): string {
  return options.home ?? join(concivStateDir(root), 'home')
}

function isolatedProvider(root: string, options: HarnessEngineStart): ConfigProvider.ConfigProvider {
  const temporary = join(concivStateDir(root), 'tmp')
  mkdirSync(temporary, {recursive: true})
  return ConfigProvider.fromEnvRecord(
    {
      ...isolatedEnv(process.env, engineHome(root, options), temporary),
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

function scriptedList(
  options: HarnessEngineStart,
  harnesses: ScriptedHarness[],
  script: ReplyScript,
  project: string,
): HarnessList {
  if (options.harness !== undefined)
    throw new Error('harnesses and harness cannot be given together: harnesses are scripted')
  const [first, ...rest] = harnesses
  if (first === undefined) throw new Error('harnesses is empty: give at least the engine harness')
  const repeated = repeatedId(harnesses)
  if (repeated !== undefined) throw new Error(`harnesses lists the id ${repeated} twice: each harness needs its own id`)
  return [script.scripted(first, project), ...rest.map((other) => script.scripted(other, project))]
}

function listedHarnesses(options: HarnessEngineStart, script: ReplyScript, project: string): HarnessList {
  if (options.harnesses !== undefined) return scriptedList(options, options.harnesses, script, project)
  if (options.harness !== undefined) return [script.adapter(options.harness)]
  return [script.scripted({}, project)]
}

function pickedFirst(harnesses: HarnessList, id: string | undefined): HarnessList {
  if (id === undefined) return harnesses
  const picked = harnesses.find((harness) => harness.id === id)
  if (picked === undefined) {
    const ids = harnesses.map((harness) => harness.id).join(', ')
    throw new Error(`the config names the harness ${id}, but the engine's harnesses are ${ids}`)
  }
  return [picked, ...harnesses.filter((harness) => harness !== picked)]
}

function engineHarnesses(
  options: HarnessEngineStart,
  script: ReplyScript,
  project: string,
  configured: string | undefined,
  root: string,
): HarnessList {
  try {
    return pickedFirst(listedHarnesses(options, script, project), configured)
  } catch (error) {
    rmSync(root, {recursive: true, force: true})
    throw error
  }
}

const KIT_OWNED_FIELDS = ['stateRoot', 'homeDir'] as const

type PluginEntry = NonNullable<ConcivConfig['plugins']>[number]

function fromWorkingFolder(target: string): string {
  return target.startsWith('./') || target.startsWith('../') ? resolve(target) : target
}

function locatePlugin(entry: PluginEntry): PluginEntry {
  if (typeof entry === 'string') return fromWorkingFolder(entry)
  return [fromWorkingFolder(entry[0]), entry[1]]
}

function engineConfig(given: ConcivConfig, options: HarnessEngineStart): ConcivConfig {
  const config = ConcivConfigSchema.parse(given)
  const owned = KIT_OWNED_FIELDS.find((field) => config[field] !== undefined)
  if (owned !== undefined) {
    throw new Error(`the kit sets ${owned} itself, inside the engine's temp root: leave ${owned} out of the config`)
  }
  if (options.directory !== undefined || config.plugins === undefined) return config
  return {...config, plugins: config.plugins.map(locatePlugin)}
}

function fixtureFolder(options: HarnessEngineStart): string | undefined {
  if (options.directory === undefined) return undefined
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
  {root, project, harnesses: [harness, ...others], config, options, configProvider, opened, live, heldClock}: Boot,
  previous: {started: Started; sessionId: string} | undefined,
  connectPort?: number,
): Promise<Started> {
  const home = engineHome(root, options)
  return start({
    options: {
      ...config,
      stateRoot: root,
      harness: harness.id,
      ...(previous === undefined ? {} : {sessionId: previous.sessionId}),
    },
    root: project,
    harness,
    harnesses: others,
    ...options.timeouts,
    staleness: () => live.staleness,
    app: {version: () => live.version},
    homeDir: home,
    configProvider,
    clock: heldClock?.layer,
    launchEditor: (file, line, column) => {
      opened.push(openedFile(file, line, column))
    },
    ...portRequest(config, options.token, previous?.started, connectPort),
  })
}

function portRequest(
  config: ConcivConfig,
  token: string | undefined,
  previous: Started | undefined,
  connectPort: number | undefined,
): Pick<StartOpts, 'port' | 'accessToken'> {
  if (previous !== undefined) return {port: {exact: previous.port}, accessToken: previous.agentToken}
  const port = connectPort ?? config.port
  return port === undefined ? {accessToken: token} : {port: {exact: port}, accessToken: token}
}

async function bootOnConnectPort(boot: Boot, port: number, refused: unknown): Promise<Started> {
  if (port > CONNECT_LAST_PORT) {
    throw new Error(`no free port between ${CONNECT_FIRST_PORT} and ${CONNECT_LAST_PORT}: ${String(refused)}`)
  }
  return bootApp(boot, undefined, port).catch((error: unknown) => {
    if (!AddressInUseSchema.safeParse(error).success) throw error
    return bootOnConnectPort(boot, port + 1, error)
  })
}

async function bootFirst(boot: Boot): Promise<Started> {
  if (boot.options.port !== 'connect') {
    if (boot.options.token !== undefined) {
      throw new Error("start gives a token without port: 'connect': the token is the connect port's pairing token")
    }
    return bootApp(boot, undefined)
  }
  if (boot.config.port !== undefined) {
    throw new Error(
      `the config gives port ${boot.config.port} and start gives port: 'connect': give the engine one port`,
    )
  }
  return bootOnConnectPort(boot, CONNECT_FIRST_PORT, undefined)
}

function fixtureWrite(project: string, fixture: string | undefined): (path: string, content: string) => Promise<void> {
  return async (path, content) => {
    if (fixture !== undefined) {
      throw new Error(
        `the engine runs on the fixture folder ${fixture}: put its files in the fixture, not through write`,
      )
    }
    writeInside(project, path, content)
  }
}

function connect(engine: Engine, browser = makeBrowserRpcClient(engine.apiBase, {token: engine.token})): () => void {
  engine.rpc = browser.rpc
  engine.turns = makeTurns(browser.rpc)
  return () => {
    engine.turns.closeAll()
    browser.close()
  }
}

async function bootAgain(boot: Boot, engine: Engine, sessionId: string, running: Running): Promise<Running> {
  const started = await bootApp(boot, {started: running.started, sessionId})
  return {started, close: connect(engine)}
}

async function closeRunning(running: Running | undefined): Promise<unknown[]> {
  if (running === undefined) return []
  running.close()
  return settleInOrder([() => running.started.stop()])
}

export async function createHarnessEngine(
  given: ConcivConfig = {},
  options: HarnessEngineStart = {},
): Promise<HarnessEngine> {
  const config = engineConfig(given, options)
  const script = replyScript(options.tokensPerSecond)
  const fixture = fixtureFolder(options)
  const root = mkdtempSync(join(tmpdir(), 'conciv-kit-'))
  const project = fixture ?? root
  if (options.git === true) {
    if (fixture !== undefined) {
      await rm(root, {recursive: true, force: true})
      throw new Error(`git: true needs the engine's own temp project, not the fixture folder ${fixture}`)
    }
    await initGitProject(project)
  }
  const harnesses = engineHarnesses(options, script, project, config.harness, root)
  const opened: HarnessEngineOpened[] = []
  const live: Live = {staleness: undefined, version: undefined}
  const removeRoot = (): Promise<void> => rm(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
  const heldClock = options.clock === 'test' ? await holdTestClock() : undefined
  const closeClock = async (): Promise<void> => heldClock?.close()
  const boot: Boot = {
    root,
    project,
    harnesses,
    config,
    options,
    configProvider: isolatedProvider(root, options),
    opened,
    live,
    heldClock,
  }
  const first = await bootFirst(boot).catch((error: unknown) => abandonStart(error, [removeRoot, closeClock]))
  const apiBase = `http://127.0.0.1:${first.port}`
  const token = first.agentToken
  const browser = makeBrowserRpcClient(apiBase, {token})
  const engine: Engine = {
    apiBase,
    token,
    rpc: browser.rpc,
    turns: makeTurns(browser.rpc),
    tools: toolClients(apiBase, token),
  }
  const state: {running: Running | undefined} = {running: {started: first, close: connect(engine, browser)}}
  const waits = new Set<OpenWait>()
  const halt = async (): Promise<unknown[]> => {
    engine.turns.closeAll()
    await engine.tools.close()
    script.releaseGate()
    const running = state.running
    state.running = undefined
    return closeRunning(running)
  }
  const stop = async (): Promise<void> => {
    for (const wait of waits) wait.end()
    const failures = [...(await halt()), ...(await settleInOrder([removeRoot, closeClock]))]
    if (failures.length > 0) throw new AggregateError(failures, 'the harness engine did not stop cleanly')
  }
  const started = await openFirstSession(engine, first.cfg.sessionId).catch((error: unknown) =>
    abandonStart(error, [stop]),
  )
  const restart = async (): Promise<void> => {
    const running = state.running
    if (running === undefined) throw new Error('the engine is stopped: it cannot restart')
    for (const wait of waits) wait.pause()
    const failures = await halt()
    if (failures.length > 0) throw new AggregateError(failures, 'the harness engine did not stop cleanly')
    state.running = await bootAgain(boot, engine, started.id, running)
    await Promise.all([...waits].map((wait) => wait.renew()))
  }
  return {
    session: started,
    newSession: (title) => newSessionOn(engine, title),
    setting: async (setting) => {
      await engine.rpc.settings.set(setting)
    },
    gate: async () => script.gate(),
    requests: async () => script.requests(),
    address: {apiBase, token},
    root: realpathSync(project),
    home: engineHome(root, options),
    opened: async () => [...opened],
    event: (type, match) => eventWait(engine, type, match, waits),
    rpc: pluginRpc(engine),
    loginCode: async () => (await makeRpcClient(apiBase, {token}).auth.issueCode()).code,
    revokeBrowsers: async () => {
      await revokeBrowsers(concivStateDir(root), 'all')
    },
    restart,
    clock: heldClock?.clock ?? realClock,
    outside: (agent) => outsideAgent(apiBase, token, agent),
    reply: async (...replies) => {
      script.add(replies)
    },
    stale: async (staleness) => {
      live.staleness = staleness
    },
    version: async (version) => {
      live.version = version
    },
    write: fixtureWrite(project, fixture),
    commit: async (message) => {
      if (options.git !== true) throw new Error('this engine has no git project: make it with git: true')
      await commitAll(project, message)
    },
    stop,
  }
}

export function createEngine(config: ConcivConfig = {}, options: HarnessEngineStart = {}): Promise<HarnessEngine> {
  const started = Promise.withResolvers<HarnessEngine>()
  onTestFinished(() =>
    started.promise.then(
      (engine) => engine.stop(),
      () => undefined,
    ),
  )
  createHarnessEngine(config, options).then(started.resolve, started.reject)
  return started.promise
}
