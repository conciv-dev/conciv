import {
  query,
  type ModelInfo,
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

async function probeCommands(ctx: HarnessCommandsContext): Promise<SlashCommand[]> {
  const input = makeInputQueue()
  const options: Options = {cwd: ctx.cwd, permissionMode: 'acceptEdits'}
  if (ctx.mcpUrl) options.mcpServers = mcpServerConfig(ctx.mcpUrl, ctx.sessionId)
  if (CONCIV_PLUGIN_DIR) options.plugins = [{type: 'local', path: CONCIV_PLUGIN_DIR}]
  const probe = query({prompt: input.stream, options})
  try {
    return await probe.supportedCommands()
  } finally {
    input.end()
    void probe.interrupt().catch(() => {})
  }
}

const DEFAULT_CONTEXT_WINDOW = 200_000

const LONG_CONTEXT_WINDOW = 1_000_000

const FALLBACK_MODELS: HarnessModel[] = [
  {id: 'opus', name: 'Opus', description: 'Best for everyday, complex tasks'},
  {id: 'sonnet', name: 'Sonnet', description: 'Efficient for routine tasks'},
  {id: 'haiku', name: 'Haiku', description: 'Fastest for quick answers'},
].map((model) => ({...model, group: 'Claude', contextWindow: DEFAULT_CONTEXT_WINDOW}))

function toHarnessModel(model: ModelInfo): HarnessModel {
  const [version, ...summary] = model.description.split(' · ')
  const versioned = version !== undefined && summary.length > 0
  return {
    id: model.value,
    name: versioned ? version : model.displayName,
    description: versioned ? summary.join(' · ') : model.description,
    group: 'Claude',
    contextWindow: model.value.endsWith('[1m]') ? LONG_CONTEXT_WINDOW : DEFAULT_CONTEXT_WINDOW,
  }
}

async function probeModels(): Promise<ModelInfo[]> {
  const input = makeInputQueue()
  const probe = query({prompt: input.stream, options: {cwd: process.cwd()}})
  try {
    return await probe.supportedModels()
  } finally {
    input.end()
    void probe.interrupt().catch(() => {})
  }
}

const modelsCache: {pending?: Promise<HarnessModel[]>} = {}

export function claudeSdkModels(): Promise<HarnessModel[]> {
  modelsCache.pending ??= probeModels().then(
    (models) => {
      const listed = models.filter((model) => model.value !== 'default').map(toHarnessModel)
      return listed.length > 0 ? listed : FALLBACK_MODELS
    },
    () => {
      delete modelsCache.pending
      return FALLBACK_MODELS
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
