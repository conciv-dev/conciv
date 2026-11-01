import {z} from 'zod'
import type {DebugConfig} from '@tanstack/ai'
import {createCodeMode, type CodeModeTool, type IsolateDriver} from '@tanstack/ai-code-mode'
import type {ChatTool} from '@conciv/protocol/chat-tool-types'

const CODE_MODE_TIMEOUT_MS = 150_000

const QUICKJS_MEMORY_LIMIT_MB = 256

const QUICKJS_MAX_STACK_BYTES = 2 * 1024 * 1024

export async function loadIsolateDriver(log: (message: string) => void): Promise<IsolateDriver | null> {
  try {
    const loaded = await import('@tanstack/ai-isolate-quickjs')
    return loaded.createQuickJSIsolateDriver({
      timeout: CODE_MODE_TIMEOUT_MS,
      memoryLimit: QUICKJS_MEMORY_LIMIT_MB,
      maxStackSize: QUICKJS_MAX_STACK_BYTES,
    })
  } catch (error) {
    log(`[ai] the code mode driver @tanstack/ai-isolate-quickjs failed to load: ${String(error)}`)
    return null
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
