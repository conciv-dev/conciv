import {query, type SDKUserMessage, type SlashCommand, type Options} from '@anthropic-ai/claude-agent-sdk'
import type {HarnessCommand, HarnessCommandsContext} from '@conciv/protocol/harness-types'
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

export async function claudeSdkCommands(ctx: HarnessCommandsContext): Promise<HarnessCommand[]> {
  const cached = commandsByCwd.get(ctx.cwd)
  if (cached) return cached
  const commands = (await probeCommands(ctx)).map(toHarnessCommand)
  commandsByCwd.set(ctx.cwd, commands)
  return commands
}
