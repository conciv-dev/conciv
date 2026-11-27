import {randomUUID} from 'node:crypto'
import {mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import {ConfigProvider, type Layer} from 'effect'
import {isMatch} from 'es-toolkit/compat'
import {rpcStream} from '@conciv/client/chat'
import type {Plugin} from '@conciv/backend-plugin-api/effect/plugin'
import {makeRpcClient, type EngineClient} from '@conciv/client'
import {browserClient} from './browser-client.js'
import {type EngineStaleness} from '@conciv/protocol'
import type {HarnessAdapter} from '@conciv/harness'
import {ChatEventType, runLifecycleEvent, type ChatEvent} from '@conciv/types/chat-event-types'
import type {ChatMessage} from '@conciv/types/chat-message-types'
import {ConcivConfigSchema, type ConcivConfig} from '@conciv/types/config-types'
import {CONNECT_FIRST_PORT, CONNECT_LAST_PORT} from '@conciv/types/connect-ports'
import {revokeBrowsers} from '@conciv/types/engine-trust'
import {concivStateDir} from '@conciv/types/state-types'
import {z} from 'zod'
import {toolClients, type ToolClients} from './call-tool.js'
import {holdTestClock, realClock, type HarnessEngineClock, type HeldClock} from './clock.js'
import {outsideAgent, type Outside, type OutsideAgent} from './outside.js'
import {replyScript, type ReplyScript, type ScriptedHarness} from '@conciv/simulation/scripted-harness'
import type {Gate, ModelRequest, Reply} from '@conciv/simulation/test-llm'
import {isolatedEnv} from '@internal/vitest-config/isolated-env'
import {commitAll, initGitProject} from './git-project.js'
import {startSimulation} from '@conciv/simulation/backend'
import {connectDrive, writeDriveManifest, type DriveEndpoints, type EngineDrive} from './drive.js'
import {testKitErrors} from '@conciv/errors'

type EngineTimeouts = {
  firstChunkTimeoutMs?: number
  firstStartTimeoutMs?: number
  uiCallWaitMs?: number
  uiAnswerWaitMs?: number
  eventHeartbeatIntervalMs?: number
  stopGraceMs?: number
}

export type HarnessEngineSetting = {scope: 'project' | 'global'; namespace: string; key: string; value: unknown}

export type EngineStart = {
  directory?: string
  timeouts?: EngineTimeouts
  harnesses?: ScriptedHarness[]
  env?: Record<string, string>
  fs?: {filewatcher?: boolean}
  clock?: 'test'
  port?: 'connect'
  token?: string
  tokensPerSecond?: number
  home?: string
  git?: boolean
  plugins?: readonly Plugin[]
  simulation?: true
}

export type BackendStart = {
  options: ConcivConfig
  root: string
  harness: HarnessAdapter
  harnesses: readonly HarnessAdapter[]
  firstChunkTimeoutMs?: number
  firstStartTimeoutMs?: number
  uiCallWaitMs?: number
  uiAnswerWaitMs?: number
  eventHeartbeatIntervalMs?: number
  stopGraceMs?: number
  staleness: () => EngineStaleness | undefined
  app: {version: () => string | undefined}
  homeDir: string
  devEndpointDir: string
  configProvider: ConfigProvider.ConfigProvider
  clock: Layer.Layer<never> | undefined
  launchEditor: (file: string, line: number, column?: number) => void
  port?: {exact: number}
  accessToken?: string
  plugins: readonly Plugin[] | undefined
  simulation: typeof startSimulation
}

export type StartedBackend = {
  port: number
  agentToken: string
  stop: () => Promise<void>
  cfg: {sessionId?: string | undefined}
}

export type CreateBackend = (start: BackendStart) => Promise<StartedBackend>

export type HarnessEngineStart = EngineStart & {harness?: HarnessAdapter}

export type HarnessEngineToolFailure = {tool: string; message: string}

export type HarnessEngineTool = {
  call: (input: unknown) => Promise<unknown>
  failure: (input: unknown) => Promise<HarnessEngineToolFailure>
}

export type HarnessEngineSession = {
  id: string
  send: (text: string, metadata?: Record<string, unknown>) => Promise<void>
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
  drive: () => Promise<EngineDrive>
  stop: () => Promise<void>
}

type Step = () => unknown

type TurnMessage = {id: string; role: 'user'; parts: ChatMessage['parts']; metadata?: Record<string, unknown>}

type OpenTurn = {sessionId: string; runId: string; abort: AbortController}

type Turns = {
  send: (sessionId: string, text: string, metadata?: Record<string, unknown>) => Promise<void>
  runIds: (sessionId: string) => string[]
  closeAll: () => void
}

type Engine = {rpc: EngineClient; apiBase: string; token: string; turns: Turns; tools: ToolClients}

type Started = StartedBackend

type Running = {started: Started; close: () => void}

type Live = {staleness: EngineStaleness | undefined; version: string | undefined}

type Boot = {
  createBackend: CreateBackend
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
    throw testKitErrors.PROJECT_FILE_OUTSIDE({path, root})
  }
  mkdirSync(dirname(target), {recursive: true})
  writeFileSync(target, content)
}

async function* streamed(opened: Promise<AsyncIterable<ChatEvent>>): AsyncGenerator<ChatEvent> {
  yield* await opened
}

function endsRun(event: ChatEvent, runId: string): boolean {
  if (event.type === ChatEventType.RUN_FINISHED)
    return (event.finishReason ?? event.metadata?.tanstack?.finishReason) !== 'tool_calls'
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
    if (event.type === ChatEventType.RUN_ERROR)
      failed(testKitErrors.RUN_FAILED({text: event.message, internal: {code: event.code}}))
    else if (endsRun(event, runId)) ended()
  }
  ended()
}

function makeTurns(rpc: EngineClient): Turns {
  const open: OpenTurn[] = []
  const connection = rpcStream((_messages, _data, signal, input) =>
    streamed(rpc.chat.send({sessionId: input.threadId, runId: input.runId, messages: input.messages}, {signal})),
  )
  return {
    send: (sessionId, text, metadata) => {
      const runId = randomUUID()
      const abort = new AbortController()
      open.push({sessionId, runId, abort})
      const message: TurnMessage = {
        id: `${runId}-user`,
        role: 'user',
        parts: [{type: 'text', content: text}],
        ...(metadata === undefined ? {} : {metadata}),
      }
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
      throw testKitErrors.TOOL_ANSWERED({name, output: JSON.stringify(output)})
    },
    (error: unknown) => ({tool: name, message: error instanceof Error ? error.message : String(error)}),
  )
}

async function asSession(engine: Engine, sessionId: string, use: (rpc: EngineClient) => Promise<void>): Promise<void> {
  const browser = browserClient(engine.apiBase, {token: engine.token, session: () => sessionId})
  try {
    await use(browser.rpc)
  } finally {
    browser.close()
  }
}

function approvePending(engine: Engine, sessionId: string): Promise<void> {
  return asSession(engine, sessionId, async (rpc) => {
    const abort = new AbortController()
    try {
      const asks = await engine.rpc.event.subscribe({types: [ASKED_EVENT]}, {signal: abort.signal})
      await asks.next()
      const pending = (): Promise<string[]> =>
        rpc.chat.hydrate({sessionId}).then(({pendingApprovals}) => pendingApprovals.map((ask) => ask.approvalId))
      if ((await pending()).length === 0) await matching(asks, ASKED_EVENT, {data: {sessionId}})
      for (const approvalId of await pending()) await rpc.chat.permissionDecision({approvalId, reply: 'once'})
    } finally {
      abort.abort()
    }
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
    send: (text, metadata) => engine.turns.send(id, text, metadata),
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
  throw testKitErrors.ENGINE_STOPPED_BEFORE_EVENT({type})
}

const OPENING_EVENT = 'server.connected'

const ASKED_EVENT = 'permission.asked'

type OpenWait = {pause: () => void; renew: () => Promise<void>; end: () => void}

async function eventWait(
  engine: Engine,
  type: string,
  match: HarnessEngineEventMatch | undefined,
  waits: Set<OpenWait>,
): Promise<HarnessEngineEventWait> {
  if (type === OPENING_EVENT) {
    throw testKitErrors.OPENING_EVENT_UNWAITABLE({event: OPENING_EVENT})
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
  const stopped = (): Error => testKitErrors.ENGINE_STOPPED_BEFORE_EVENT({type})
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
    engine.rpc.plugin.invoke({rpcId, method, input})
  return {
    call,
    failure: (rpcId, method, input) =>
      call(rpcId, method, input).then((output) => {
        throw testKitErrors.RPC_ANSWERED({method: `${rpcId}.${method}`, output: JSON.stringify(output)})
      }, rpcFailure),
  }
}

function engineHome(root: string, options: HarnessEngineStart): string {
  return options.home ?? join(concivStateDir(root), 'home')
}

function isolatedProvider(
  root: string,
  options: HarnessEngineStart,
  driveEnv: Record<string, string>,
): ConfigProvider.ConfigProvider {
  const temporary = join(concivStateDir(root), 'tmp')
  mkdirSync(temporary, {recursive: true})
  return ConfigProvider.fromEnvRecord(
    {
      ...isolatedEnv(process.env, engineHome(root, options), temporary),
      ...options.env,
      ...driveEnv,
      ...(options.fs?.filewatcher === true ? {} : {CONCIV_DISABLE_FILEWATCHER: 'true'}),
    },
    {preserveEmptyStrings: true},
  )
}

function requireDrive(endpoints: DriveEndpoints | undefined): DriveEndpoints {
  if (endpoints === undefined) throw testKitErrors.NOT_DRIVEN()
  return endpoints
}

async function closeDrive(connected: ReturnType<typeof connectDrive> | undefined): Promise<void> {
  if (connected === undefined) return
  await (await connected).close()
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
  if (options.harness !== undefined) throw testKitErrors.HARNESSES_AND_HARNESS()
  const [first, ...rest] = harnesses
  if (first === undefined) throw testKitErrors.HARNESSES_EMPTY()
  const repeated = repeatedId(harnesses)
  if (repeated !== undefined) throw testKitErrors.HARNESS_ID_REPEATED({id: repeated})
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
    throw testKitErrors.HARNESS_NOT_LISTED({id, ids})
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

const KIT_OWNED_FIELDS = ['stateRoot', 'homeDir', 'devEndpointDir'] as const

function engineConfig(given: ConcivConfig): ConcivConfig {
  const config = ConcivConfigSchema.parse(given)
  const owned = KIT_OWNED_FIELDS.find((field) => config[field] !== undefined)
  if (owned !== undefined) {
    throw testKitErrors.KIT_OWNED_CONFIG({owned})
  }
  return config
}

function fixtureFolder(options: HarnessEngineStart): string | undefined {
  if (options.directory === undefined) return undefined
  const folder = resolve(options.directory)
  if (!statSync(folder, {throwIfNoEntry: false})?.isDirectory()) {
    throw testKitErrors.DIRECTORY_MISSING({folder})
  }
  return folder
}

function openedFile(file: string, line: number | undefined, column: number | undefined): HarnessEngineOpened {
  return {file, ...(line === undefined ? {} : {line}), ...(column === undefined ? {} : {column})}
}

function bootApp(
  {
    createBackend,
    root,
    project,
    harnesses: [harness, ...others],
    config,
    options,
    configProvider,
    opened,
    live,
    heldClock,
  }: Boot,
  previous: {started: Started; sessionId: string} | undefined,
  connectPort?: number,
): Promise<Started> {
  const home = engineHome(root, options)
  return createBackend({
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
    devEndpointDir: join(home, 'dev-endpoint'),
    configProvider,
    clock: heldClock?.layer,
    launchEditor: (file, line, column) => {
      opened.push(openedFile(file, line, column))
    },
    ...portRequest(config, options.token, previous?.started, connectPort),
    plugins: options.plugins,
    simulation: startSimulation,
  })
}

function portRequest(
  config: ConcivConfig,
  token: string | undefined,
  previous: Started | undefined,
  connectPort: number | undefined,
): {port?: {exact: number}; accessToken?: string} {
  if (previous !== undefined) return {port: {exact: previous.port}, accessToken: previous.agentToken}
  const port = connectPort ?? config.port
  return port === undefined ? {accessToken: token} : {port: {exact: port}, accessToken: token}
}

async function bootOnConnectPort(boot: Boot, port: number, refused: unknown): Promise<Started> {
  if (port > CONNECT_LAST_PORT) {
    throw testKitErrors.NO_FREE_PORT({
      first: CONNECT_FIRST_PORT,
      last: CONNECT_LAST_PORT,
      reason: refused instanceof Error ? refused.message : String(refused),
      cause: refused instanceof Error ? refused : undefined,
    })
  }
  return bootApp(boot, undefined, port).catch((error: unknown) => {
    if (!AddressInUseSchema.safeParse(error).success) throw error
    return bootOnConnectPort(boot, port + 1, error)
  })
}

async function bootFirst(boot: Boot): Promise<Started> {
  if (boot.options.port !== 'connect') {
    if (boot.options.token !== undefined) {
      throw testKitErrors.TOKEN_WITHOUT_CONNECT()
    }
    return bootApp(boot, undefined)
  }
  if (boot.config.port !== undefined) {
    throw testKitErrors.TWO_PORTS({port: boot.config.port})
  }
  return bootOnConnectPort(boot, CONNECT_FIRST_PORT, undefined)
}

function fixtureWrite(project: string, fixture: string | undefined): (path: string, content: string) => Promise<void> {
  return async (path, content) => {
    if (fixture !== undefined) {
      throw testKitErrors.WRITE_INTO_FIXTURE({fixture})
    }
    writeInside(project, path, content)
  }
}

function connect(engine: Engine, browser = browserClient(engine.apiBase, {token: engine.token})): () => void {
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
  createBackend: CreateBackend,
  given: ConcivConfig = {},
  options: HarnessEngineStart = {},
): Promise<HarnessEngine> {
  const config = engineConfig(given)
  const script = replyScript(options.tokensPerSecond)
  const fixture = fixtureFolder(options)
  const root = mkdtempSync(join(tmpdir(), 'conciv-kit-'))
  const project = fixture ?? root
  if (options.git === true) {
    if (fixture !== undefined) {
      await rm(root, {recursive: true, force: true})
      throw testKitErrors.GIT_ON_FIXTURE({fixture})
    }
    await initGitProject(project)
  }
  const harnesses = engineHarnesses(options, script, project, config.harness, root)
  const opened: HarnessEngineOpened[] = []
  const live: Live = {staleness: undefined, version: undefined}
  const removeRoot = (): Promise<void> => rm(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
  const heldClock = options.clock === 'test' ? await holdTestClock() : undefined
  const closeClock = async (): Promise<void> => heldClock?.close()
  const driveManifest = options.simulation === true ? await writeDriveManifest(concivStateDir(root)) : undefined
  const boot: Boot = {
    createBackend,
    root,
    project,
    harnesses,
    config,
    options,
    configProvider: isolatedProvider(
      root,
      options,
      driveManifest === undefined ? {} : {...driveManifest.env, CONCIV_SIMULATE: 'true'},
    ),
    opened,
    live,
    heldClock,
  }
  const first = await bootFirst(boot).catch((error: unknown) => abandonStart(error, [removeRoot, closeClock]))
  const apiBase = `http://127.0.0.1:${first.port}`
  const token = first.agentToken
  const browser = browserClient(apiBase, {token})
  const engine: Engine = {
    apiBase,
    token,
    rpc: browser.rpc,
    turns: makeTurns(browser.rpc),
    tools: toolClients(apiBase, token),
  }
  const state: {running: Running | undefined} = {running: {started: first, close: connect(engine, browser)}}
  const waits = new Set<OpenWait>()
  const driving: {connected: ReturnType<typeof connectDrive> | undefined} = {connected: undefined}
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
    const failures = [
      ...(await halt()),
      ...(await settleInOrder([() => closeDrive(driving.connected), removeRoot, closeClock])),
    ]
    if (failures.length > 0) throw new AggregateError(failures, 'the harness engine did not stop cleanly')
  }
  const started = await openFirstSession(engine, first.cfg.sessionId).catch((error: unknown) =>
    abandonStart(error, [stop]),
  )
  const restart = async (): Promise<void> => {
    const running = state.running
    if (running === undefined) throw testKitErrors.ENGINE_STOPPED()
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
      if (options.git !== true) throw testKitErrors.NO_GIT_PROJECT()
      await commitAll(project, message)
    },
    drive: () => {
      driving.connected ??= connectDrive(requireDrive(driveManifest?.endpoints))
      return driving.connected
    },
    stop,
  }
}
