import {
  query,
  type ModelInfo,
  type SDKControlInitializeResponse,
  type SDKUserMessage,
  type SlashCommand,
  type Options,
} from '@anthropic-ai/claude-agent-sdk'
import type {HarnessCommand, HarnessCommandsContext, HarnessModel} from '@conciv/protocol/harness-types'
import {mcpServerConfig} from './args.js'
import {CONCIV_PLUGIN_DIR} from './plugin-dir.js'

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
  rememberModels(init.models)
  return init.commands
}

const CURRENT_GROUP = 'Claude'

const OLDER_GROUP = 'Older versions'

const PINNED_PREFIX = 'claude-'

function familyOf(value: string): string {
  return value.replace(PINNED_PREFIX, '').split(/[-[]/)[0] ?? value
}

function toHarnessModel(model: ModelInfo, aliasFamilies: ReadonlySet<string>): HarnessModel {
  const [version, ...summary] = model.description.split(' · ')
  const versioned = version !== undefined && summary.length > 0
  const superseded = model.value.startsWith(PINNED_PREFIX) && aliasFamilies.has(familyOf(model.value))
  return {
    id: model.value,
    name: versioned ? version : model.displayName,
    description: versioned ? summary.join(' · ') : model.description,
    group: superseded ? OLDER_GROUP : CURRENT_GROUP,
  }
}

function toHarnessModels(models: ModelInfo[]): HarnessModel[] {
  const rows = models.filter((model) => model.value !== 'default')
  const aliasFamilies = new Set(
    rows.filter((model) => !model.value.startsWith(PINNED_PREFIX)).map((model) => familyOf(model.value)),
  )
  return rows.map((model) => toHarnessModel(model, aliasFamilies))
}

function rememberModels(models: ModelInfo[]): void {
  modelsCache.pending ??= Promise.resolve(toHarnessModels(models))
}

const modelsCache: {pending?: Promise<HarnessModel[]>} = {}

export function claudeSdkModels(): Promise<HarnessModel[]> {
  modelsCache.pending ??= probe({cwd: process.cwd()}).then(
    (init) => toHarnessModels(init.models),
    (error: unknown) => {
      delete modelsCache.pending
      throw error
    },
  )
  return modelsCache.pending
}

export async function claudeSdkCommands(ctx: HarnessCommandsContext): Promise<HarnessCommand[]> {
  const cached = commandsByCwd.get(ctx.cwd)
  if (cached) return cached
  const commands = (await probeCommands(ctx)).map(toHarnessCommand)
  commandsByCwd.set(ctx.cwd, commands)
  return commands
}
