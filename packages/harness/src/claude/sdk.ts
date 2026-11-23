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
import {mcpServerConfig} from './args.js'
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

async function probe(options: Options): Promise<SDKControlInitializeResponse> {
  const {query} = await loadClaudeAgentSdk()
  const input = makeInputQueue()
  const session = query({prompt: input.stream, options})
  try {
    return await session.initializationResult()
  } finally {
    input.end()
    void session.interrupt().catch(() => {})
  }
}

async function probeCommands(ctx: HarnessCommandsContext): Promise<SlashCommand[]> {
  const options: Options = {cwd: ctx.cwd, permissionMode: 'acceptEdits'}
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

function rememberProbe(init: SDKControlInitializeResponse): void {
  if (toHarnessModels(init.models).length > 0) probeCache.pending ??= Promise.resolve(init)
}

const probeCache: {pending?: Promise<SDKControlInitializeResponse>} = {}

function followSignal(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  if (signal.aborted) controller.abort(signal.reason)
  signal.addEventListener('abort', () => controller.abort(signal.reason), {once: true})
  return controller
}

function probeListed(signal: AbortSignal): Promise<SDKControlInitializeResponse> {
  return probe({cwd: process.cwd(), abortController: followSignal(signal)}).then((init) => {
    listedModels(init.models)
    return init
  })
}

function probed(signal: AbortSignal): Promise<SDKControlInitializeResponse> {
  probeCache.pending ??= probeListed(signal).catch((error: unknown) => {
    delete probeCache.pending
    throw error
  })
  return probeCache.pending
}

export function claudeSdkModels({signal}: {signal: AbortSignal}): Promise<HarnessModel[]> {
  return probed(signal).then((init) => listedModels(init.models))
}

const NOT_LOGGED_IN = 'Claude Code is not logged in. Run `claude auth login` in a terminal.'

function isLoggedIn(account: AccountInfo): boolean {
  return account.tokenSource !== 'none' || account.apiKeySource !== undefined
}

function readLogin(init: SDKControlInitializeResponse): HarnessLoginStatus {
  return isLoggedIn(init.account) ? {loggedIn: true} : {loggedIn: false, message: NOT_LOGGED_IN}
}

export async function claudeSdkLogin({signal}: {signal: AbortSignal}): Promise<HarnessLoginStatus> {
  const cached = probeCache.pending
  const login = readLogin(await probed(signal))
  if (login.loggedIn || cached === undefined) return login
  if (probeCache.pending === cached) delete probeCache.pending
  return readLogin(await probed(signal))
}

export async function claudeSdkCommands(ctx: HarnessCommandsContext): Promise<HarnessCommand[]> {
  const cached = commandsByCwd.get(ctx.cwd)
  if (cached) return cached
  const commands = (await probeCommands(ctx)).map(toHarnessCommand)
  commandsByCwd.set(ctx.cwd, commands)
  return commands
}
