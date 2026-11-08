import {z} from 'zod'
import type {DebugConfig} from '@tanstack/ai'
import {createCodeMode, type CodeModeTool, type IsolateDriver} from '@tanstack/ai-code-mode'
import type {ChatTool} from '@conciv/protocol/chat-tool-types'
import {quickJSThreadDriver} from './quickjs-thread.js'

const CODE_MODE_TIMEOUT_MS = 150_000

const QUICKJS_MEMORY_LIMIT_MB = 256

const QUICKJS_MAX_STACK_BYTES = 2 * 1024 * 1024

type Log = (message: string) => void

export function loadIsolateDriver(log: Log): IsolateDriver {
  log(
    `[ai] code mode runs on @tanstack/ai-isolate-quickjs in a worker thread, node ${process.version} at ${process.execPath}`,
  )
  return quickJSThreadDriver(
    {timeout: CODE_MODE_TIMEOUT_MS, memoryLimit: QUICKJS_MEMORY_LIMIT_MB, maxStackSize: QUICKJS_MAX_STACK_BYTES},
    log,
  )
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
        execute: (code, options) => context.execute(code, options),
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

const DISCOVER_DESCRIPTION =
  'Return the full TypeScript signature, description and declared errors of named sandbox capabilities. Pass toolNames: the external_* capability names listed for execute_typescript (the external_ prefix is optional). Call this as its own tool call before writing execute_typescript code that uses those capabilities; it is not available inside the sandbox.'

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
  const discover =
    codeMode.discoveryTool === null ? null : {...codeMode.discoveryTool, description: DISCOVER_DESCRIPTION}
  return {
    tools: discover === null ? [execute] : [execute, discover],
    systemPrompt: codeMode.systemPrompt,
    execute,
    discover,
  }
}
