import {randomUUID} from 'node:crypto'
import {mkdirSync, mkdtempSync, realpathSync, statSync, writeFileSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path'
import {ConfigProvider} from 'effect'
import {rpcStream} from '@conciv/ai/client'
import {makeBrowserRpcClient, type EngineStaleness, type RpcClient} from '@conciv/contract'
import {makeApp, type MadeApp, type MakeAppOpts} from '@conciv/core/app'
import {resolveConfig} from '@conciv/core/config'
import type {HarnessAdapter} from '@conciv/harness'
import {ChatEventType, runLifecycleEvent, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import type {HarnessCommand, HarnessModel} from '@conciv/protocol/harness-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {serveHono} from '@conciv/serve'
import {callTool} from './call-tool.js'
import {replyScript, type ReplyScript, type ScriptedHarness} from './scripted-harness.js'
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
  policies?: ConcivConfig['policies']
  systemPrompt?: string
  sessionId?: string
  timeouts?: Pick<
    MakeAppOpts,
    'firstChunkTimeoutMs' | 'eventHeartbeatIntervalMs' | 'stopGraceMs' | 'pageReplyTimeoutMs' | 'queuedActionTimeoutMs'
  >
  staleness?: EngineStaleness
  directory?: string
  models?: HarnessModel[]
  commands?: HarnessCommand[]
  harnesses?: ScriptedHarness[]
  fs?: {filewatcher?: boolean}
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

async function eventWait(engine: Engine, type: string, waits: Set<AbortController>): Promise<HarnessEngineEventWait> {
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

async function bootApp(
  root: string,
  project: string,
  [harness, ...others]: HarnessList,
  options: HarnessEngineOptions,
  configProvider: ConfigProvider.ConfigProvider,
  opened: HarnessEngineOpened[],
): Promise<{app: MadeApp; sessionId: string | undefined}> {
  const config = options.config ?? {}
  const {staleness} = options
  const resolved = resolveConfig(
    {sessionId: options.sessionId, permission: config.permission, permissions: config.permissions},
    root,
    configProvider,
  )
  for (const [path, content] of Object.entries(options.files ?? {})) writeInside(project, path, content)
  const app = await makeApp({
    print: () => {},
    cfg: {
      enabled: true,
      stateRoot: root,
      harness: harness.id,
      sessionId: resolved.sessionId,
      harnessSessionId: undefined,
      systemPrompt: options.systemPrompt ?? '',
      hubAccess: 'project',
      plugins: config.plugins ?? [],
      policies: options.policies ?? [],
      permissions: resolved.permissions,
    },
    cwd: project,
    openInEditor: (file, line, column) => {
      opened.push(openedFile(file, line, column))
    },
    harness,
    harnesses: others,
    home: engineHome(root),
    configProvider,
    ...options.timeouts,
    ...(staleness === undefined ? {} : {staleness: () => staleness}),
  })
  await app.awaitActivation().catch((error: unknown) => abandonStart(error, [() => app.dispose()]))
  return {app, sessionId: resolved.sessionId}
}

export async function createHarnessEngine(options: HarnessEngineOptions = {}): Promise<HarnessEngine> {
  const script = replyScript(options.replies ?? [])
  const harnesses = listedHarnesses(options, script)
  const fixture = fixtureFolder(options)
  const root = mkdtempSync(join(tmpdir(), 'conciv-kit-'))
  const project = fixture ?? root
  const opened: HarnessEngineOpened[] = []
  const removeRoot = (): Promise<void> => rm(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
  const {app, sessionId} = await Promise.resolve()
    .then(() => bootApp(root, project, harnesses, options, isolatedProvider(root, options), opened))
    .catch((error: unknown) => abandonStart(error, [removeRoot]))
  const served = await serveHono({fetch: app.fetch}).catch((error: unknown) =>
    abandonStart(error, [() => app.dispose(), removeRoot]),
  )
  const apiBase = `http://127.0.0.1:${served.port}/t/${app.agentToken}`
  const browser = makeBrowserRpcClient(apiBase)
  const engine: Engine = {rpc: browser.rpc, apiBase, turns: makeTurns(browser.rpc)}
  const waits = new Set<AbortController>()
  const stop = async (): Promise<void> => {
    for (const wait of waits) wait.abort()
    script.releaseGate()
    engine.turns.closeAll()
    browser.close()
    const failures = await settleInOrder([() => served.close(), () => app.dispose(), removeRoot])
    if (failures.length > 0) throw new AggregateError(failures, 'the harness engine did not stop cleanly')
  }
  const started = await openFirstSession(engine, options.settings ?? [], sessionId).catch((error: unknown) =>
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
    root: realpathSync(project),
    opened: async () => [...opened],
    event: (type) => eventWait(engine, type, waits),
    stop,
  }
}
