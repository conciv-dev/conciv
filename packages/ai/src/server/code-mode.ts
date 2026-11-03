import {z} from 'zod'
import type {DebugConfig} from '@tanstack/ai'
import {createCodeMode, type CodeModeTool, type IsolateDriver} from '@tanstack/ai-code-mode'
import type {ChatTool} from '@conciv/protocol/chat-tool-types'
import {quickJSThreadDriver} from './quickjs-thread.js'

const CODE_MODE_TIMEOUT_MS = 150_000

const QUICKJS_MEMORY_LIMIT_MB = 256

const QUICKJS_MAX_STACK_BYTES = 2 * 1024 * 1024

type Log = (message: string) => void

type DriverCandidate = {name: string; create: (log: Log) => Promise<IsolateDriver | null>}

const DRIVER_CANDIDATES: readonly DriverCandidate[] = [
  {
    name: '@tanstack/ai-isolate-node',
    create: async () => {
      const loaded = await import('@tanstack/ai-isolate-node')
      if (!loaded.probeIsolatedVm().compatible) return null
      return loaded.createNodeIsolateDriver({timeout: CODE_MODE_TIMEOUT_MS})
    },
  },
  {
    name: '@tanstack/ai-isolate-quickjs in a worker thread',
    create: async (log) =>
      quickJSThreadDriver(
        {timeout: CODE_MODE_TIMEOUT_MS, memoryLimit: QUICKJS_MEMORY_LIMIT_MB, maxStackSize: QUICKJS_MAX_STACK_BYTES},
        log,
      ),
  },
]

async function attempt(candidate: DriverCandidate, log: Log): Promise<IsolateDriver | null> {
  try {
    const driver = await candidate.create(log)
    if (driver === null) log(`[ai] the code mode driver ${candidate.name} is incompatible with this platform`)
    return driver
  } catch (error) {
    log(`[ai] the code mode driver ${candidate.name} failed to load: ${String(error)}`)
    return null
  }
}

export async function loadIsolateDriver(log: Log): Promise<IsolateDriver | null> {
  for (const candidate of DRIVER_CANDIDATES) {
    const driver = await attempt(candidate, log)
    if (driver !== null) return driver
  }
  log('[ai] code mode found no usable isolate driver')
  return null
}

export function stoppedWith(driver: IsolateDriver, signal: AbortSignal, log: Log): IsolateDriver {
  return {
    createContext: async (config) => {
      const context = await driver.createContext(config)
      const stop = () =>
        void context
          .dispose()
          .catch((error: unknown) => log(`[ai] stopping a code mode program failed: ${String(error)}`))
      signal.addEventListener('abort', stop, {once: true})
      if (signal.aborted) stop()
      return {
        execute: <T>(code: string) => context.execute<T>(code),
        dispose: () => {
          signal.removeEventListener('abort', stop)
          return context.dispose()
        },
      }
    },
  }
}

function isServerTool(tool: ChatTool): tool is CodeModeTool {
  return '__toolSide' in tool && tool.__toolSide === 'server'
}

export type CodeModeTools = {tools: ChatTool[]; systemPrompt: string; execute: ChatTool; discover: ChatTool | null}

type ToolContext = Parameters<NonNullable<ChatTool['execute']>>[1]

function withResult(tool: ChatTool, shape: (value: unknown) => unknown): ChatTool {
  const execute = tool.execute
  if (!execute) return tool
  return {...tool, execute: async (args: unknown, context?: ToolContext) => shape(await execute(args, context))}
}

const SECRET_REFUSAL = 'looks like a secret, so code mode refuses to run it'

const FailedRunSchema = z.object({success: z.literal(false), error: z.object({message: z.string()})})

export function secretRefusalOf(result: unknown): string | null {
  const failed = FailedRunSchema.safeParse(result)
  return failed.success && failed.data.error.message.includes(SECRET_REFUSAL) ? failed.data.error.message : null
}

function refusingSecrets(tool: CodeModeTool, secrets: ReadonlyMap<string, string>): CodeModeTool {
  const execute = tool.execute
  if (!execute) return tool
  return {
    ...tool,
    execute: (args, context) => {
      const parameter = secrets.get(`external_${tool.name}`)
      if (parameter !== undefined) {
        throw new Error(`"${tool.name}" takes "${parameter}", which ${SECRET_REFUSAL}`)
      }
      return execute(args, context)
    },
  }
}

export function codeModeTools(
  driver: IsolateDriver,
  tools: readonly ChatTool[],
  shapeResult: (value: unknown) => unknown,
  debug: DebugConfig,
): CodeModeTools | null {
  const serverTools = tools.filter(isServerTool)
  if (serverTools.length === 0) return null
  const secrets = new Map<string, string>()
  const codeMode = createCodeMode({
    driver,
    tools: serverTools.map((tool) => refusingSecrets(tool, secrets)),
    timeout: CODE_MODE_TIMEOUT_MS,
    debug,
    onSecretParameter: (found) => secrets.set(found.toolName, found.paramPath.join('.')),
    lazyToolsConfig: {includeDescription: 'first-sentence'},
  })
  const execute = withResult(codeMode.tool, shapeResult)
  const discover = codeMode.discoveryTool
  return {
    tools: discover === null ? [execute] : [execute, discover],
    systemPrompt: codeMode.systemPrompt,
    execute,
    discover,
  }
}
