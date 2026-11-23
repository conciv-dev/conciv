import type * as ClaudeAgentSdk from '@anthropic-ai/claude-agent-sdk'
import type {
  AccountInfo,
  ModelInfo,
  SDKControlInitializeResponse,
  SDKUserMessage,
  SlashCommand,
  Options,
} from '@anthropic-ai/claude-agent-sdk'
import type {HarnessLoginStatus} from '@conciv/protocol/chat-types'
import type {HarnessCommand, HarnessCommandsContext, HarnessModel} from '@conciv/protocol/harness-types'
import {onPath} from '../_shared/on-path.js'
import {CLAUDE_BIN, mcpServerConfig} from './args.js'
import {CONCIV_PLUGIN_DIR} from './plugin-dir.js'

let claudeAgentSdk: Promise<typeof ClaudeAgentSdk> | undefined

export function loadClaudeAgentSdk(): Promise<typeof ClaudeAgentSdk> {
  claudeAgentSdk ??= import('@anthropic-ai/claude-agent-sdk').catch((error: unknown) => {
    claudeAgentSdk = undefined
    throw error
  })
  return claudeAgentSdk
}

type InputQueue = {end: () => void; stream: AsyncGenerator<SDKUserMessage>}

function makeInputQueue(): InputQueue {
  const waiters: ((r: IteratorResult<SDKUserMessage>) => void)[] = []
  const state = {done: false}
  function end(): void {
    state.done = true
    const w = waiters.shift()
    if (w) w({value: undefined, done: true})
  }
  async function* stream(): AsyncGenerator<SDKUserMessage> {
    while (!state.done) {
      const next = await new Promise<IteratorResult<SDKUserMessage>>((resolve) => waiters.push(resolve))
      if (next.done) return
      yield next.value
    }
  }
  return {end, stream: stream()}
}

const commandsByCwd = new Map<string, HarnessCommand[]>()

function toHarnessCommand(command: SlashCommand): HarnessCommand {
  return {
    name: command.name,
    description: command.description,
    ...(command.argumentHint ? {argumentHint: command.argumentHint} : {}),
  }
}

export function __commandsCacheSet(cwd: string, commands: HarnessCommand[]): void {
  commandsByCwd.set(cwd, commands)
}

const PROBE_START_TIMEOUT_MS = 30_000

const NOT_INSTALLED = 'Claude Code is not installed. Install it, then run `claude auth login`.'

function claudeInstalled(env: ClaudeProbeEnv): boolean {
  return onPath(env.PATH ?? '', CLAUDE_BIN)
}

async function probe(options: Options & {env: ClaudeProbeEnv}): Promise<SDKControlInitializeResponse> {
  if (!claudeInstalled(options.env)) throw new Error(NOT_INSTALLED)
  const {query} = await loadClaudeAgentSdk()
  const input = makeInputQueue()
  const abortController = followSignal(AbortSignal.timeout(PROBE_START_TIMEOUT_MS))
  const session = query({
    prompt: input.stream,
    options: {...options, pathToClaudeCodeExecutable: CLAUDE_BIN, abortController},
  })
  try {
    return await session.initializationResult()
  } finally {
    input.end()
    void session.interrupt().catch(() => {})
  }
}

export type ClaudeProbeEnv = Record<string, string | undefined>

async function probeCommands(ctx: HarnessCommandsContext, env: ClaudeProbeEnv): Promise<SlashCommand[]> {
  const options: Options & {env: ClaudeProbeEnv} = {cwd: ctx.cwd, env, permissionMode: 'acceptEdits'}
  if (ctx.mcpUrl) options.mcpServers = mcpServerConfig(ctx.mcpUrl, ctx.sessionId)
  if (CONCIV_PLUGIN_DIR) options.plugins = [{type: 'local', path: CONCIV_PLUGIN_DIR}]
  const init = await probe(options)
  rememberProbe(init)
  return init.commands
}

const CURRENT_GROUP = 'Claude'

const OLDER_GROUP = 'Older versions'

const PINNED_PREFIX = 'claude-'

function readFamily(value: string): string {
  return value.replace(PINNED_PREFIX, '').split(/[-[]/)[0] ?? value
}

function toHarnessModel(model: ModelInfo, aliasFamilies: ReadonlySet<string>): HarnessModel {
  const [version, ...summary] = model.description.split(' · ')
  const versioned = version !== undefined && summary.length > 0
  const superseded = model.value.startsWith(PINNED_PREFIX) && aliasFamilies.has(readFamily(model.value))
  return {
    id: model.value,
    name: versioned ? version : model.displayName,
    description: versioned ? summary.join(' · ') : model.description,
    group: superseded ? OLDER_GROUP : CURRENT_GROUP,
    ...(model.supportsEffort && model.supportedEffortLevels?.length ? {efforts: model.supportedEffortLevels} : {}),
  }
}

function toHarnessModels(models: ModelInfo[]): HarnessModel[] {
  const rows = models.filter((model) => model.value !== 'default')
  const aliasFamilies = new Set(
    rows.filter((model) => !model.value.startsWith(PINNED_PREFIX)).map((model) => readFamily(model.value)),
  )
  return rows.map((model) => toHarnessModel(model, aliasFamilies))
}

function listedModels(models: ModelInfo[]): HarnessModel[] {
  const listed = toHarnessModels(models)
  if (listed.length === 0) throw new Error('the Agent SDK listed no Claude models')
  return listed
}

type ProbeState =
  | {type: 'idle'}
  | {type: 'checking'; probe: Promise<SDKControlInitializeResponse>}
  | {type: 'held'; init: SDKControlInitializeResponse; refresh?: Promise<SDKControlInitializeResponse>}

const probeState: {current: ProbeState} = {current: {type: 'idle'}}

function rememberProbe(init: SDKControlInitializeResponse): void {
  if (probeState.current.type === 'idle' && toHarnessModels(init.models).length > 0) {
    probeState.current = {type: 'held', init}
  }
}

function followSignal(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  if (signal.aborted) controller.abort(signal.reason)
  signal.addEventListener('abort', () => controller.abort(signal.reason), {once: true})
  return controller
}

function probeListed(env: ClaudeProbeEnv): Promise<SDKControlInitializeResponse> {
  const before = probeState.current
  return probe({cwd: process.cwd(), env})
    .then((init) => {
      listedModels(init.models)
      return init
    })
    .then(
      (init) => {
        probeState.current = {type: 'held', init}
        return init
      },
      (error: unknown) => {
        probeState.current = before.type === 'held' ? {type: 'held', init: before.init} : {type: 'idle'}
        throw error
      },
    )
}

type ProbeContext = {env: ClaudeProbeEnv}

function startChecking({env}: ProbeContext): Promise<SDKControlInitializeResponse> {
  const pending = probeListed(env)
  probeState.current = {type: 'checking', probe: pending}
  return pending
}

function refreshHeld(init: SDKControlInitializeResponse, env: ClaudeProbeEnv): void {
  const refresh = probeListed(env)
  probeState.current = {type: 'held', init, refresh}
  refresh.catch(() => {})
}

function probed(context: ProbeContext): Promise<SDKControlInitializeResponse> {
  const current = probeState.current
  if (current.type === 'checking') return current.probe
  if (current.type === 'held') return current.refresh ?? Promise.resolve(current.init)
  return startChecking(context)
}

export function claudeSdkModels(context: ProbeContext): Promise<HarnessModel[]> {
  return probed(context).then((init) => listedModels(init.models))
}

const NOT_LOGGED_IN = 'Claude Code is not logged in. Run `claude auth login` in a terminal.'

function isLoggedIn(account: AccountInfo): boolean {
  return account.tokenSource !== 'none' || account.apiKeySource !== undefined
}

function readLogin(init: SDKControlInitializeResponse): HarnessLoginStatus {
  return isLoggedIn(init.account) ? {loggedIn: true} : {loggedIn: false, message: NOT_LOGGED_IN}
}

export async function claudeSdkLogin({
  refresh,
  ...context
}: ProbeContext & {refresh: boolean}): Promise<HarnessLoginStatus> {
  if (!claudeInstalled(context.env)) return {loggedIn: false, message: NOT_INSTALLED}
  const current = probeState.current
  if (current.type !== 'held') return readLogin(await probed(context))
  const login = readLogin(current.init)
  if ((refresh || !login.loggedIn) && current.refresh === undefined) refreshHeld(current.init, context.env)
  return login
}

export async function claudeSdkCommands(ctx: HarnessCommandsContext, env: ClaudeProbeEnv): Promise<HarnessCommand[]> {
  const cached = commandsByCwd.get(ctx.cwd)
  if (cached) return cached
  const commands = (await probeCommands(ctx, env)).map(toHarnessCommand)
  commandsByCwd.set(ctx.cwd, commands)
  return commands
}
