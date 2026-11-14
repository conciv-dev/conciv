import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {
  CapabilityRegistry,
  convertSchemaToJsonSchema,
  createCapability,
  isStandardSchema,
  parseWithStandardSchema,
  type Capability,
  type DebugConfig,
  type SchemaInput,
} from '@tanstack/ai'
import {
  createCodeMode,
  createCodeModeTool,
  jsonSchemaToTypeScript,
  type CodeModeTool,
  type IsolateDriver,
} from '@tanstack/ai-code-mode'
import {codeModeCallEvent, codeModeErrorEvent, codeModeResultEvent} from '@conciv/protocol/chat-event-types'
import {ChatContentPartSchema, type ChatContentPart} from '@conciv/protocol/chat-types'
import type {ChatTool} from '@conciv/protocol/chat-tool-types'
import {CODE_MODE_TIMEOUT_MS} from '@conciv/protocol/chat-types'
import {quickJSThreadDriver, type CodeDriver} from './quickjs-thread.js'

const QUICKJS_MEMORY_LIMIT_MB = 256

const QUICKJS_MAX_STACK_BYTES = 2 * 1024 * 1024

type Log = (message: string) => void

type DriverCandidate = {name: string; create: (log: Log) => Promise<CodeDriver | null>}

const DRIVER_CANDIDATES: readonly DriverCandidate[] = [
  {
    name: '@tanstack/ai-isolate-node',
    create: async () => {
      const loaded = await import('@tanstack/ai-isolate-node')
      if (!loaded.probeIsolatedVm().compatible) return null
      const driver = loaded.createNodeIsolateDriver({timeout: CODE_MODE_TIMEOUT_MS})
      return {createContext: (config) => driver.createContext(config), dispose: async () => undefined}
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

async function attempt(candidate: DriverCandidate, log: Log): Promise<CodeDriver | null> {
  try {
    const driver = await candidate.create(log)
    if (driver === null) log(`[ai] the code mode driver ${candidate.name} is incompatible with this platform`)
    return driver
  } catch (error) {
    log(`[ai] the code mode driver ${candidate.name} failed to load: ${String(error)}`)
    return null
  }
}

export async function loadIsolateDriver(log: Log): Promise<CodeDriver | null> {
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

export type CodeModeTools = {tools: ChatTool[]; preface: string; execute: ChatTool; discover: ChatTool | null}

const SANDBOX_PREFACE = `## Code Execution Tool

You have access to \`execute_typescript\` which runs TypeScript code in a sandboxed environment.

### When to Use

Use \`execute_typescript\` when you need to:
- Process data with loops, conditionals, or complex logic
- Make multiple API calls in parallel (Promise.all)
- Transform, filter, or aggregate data
- Perform calculations or data analysis

For simple operations, prefer calling tools directly.

### Important Notes

- All \`external_*\` calls are async - always use \`await\`
- Return a value to pass results back to you. The tool returns \`{ success, result, logs, error }\`, where \`result\` is the value your code returned
- Use \`console.log()\` for debugging (logs are captured)
- The sandbox is isolated - no network access or file system
- Each execution is independent (no shared state between calls)
`

type ToolContext = Parameters<NonNullable<ChatTool['execute']>>[1]

function withResult(tool: ChatTool, shape: (value: unknown) => unknown): ChatTool {
  const execute = tool.execute
  if (!execute) return tool
  return {...tool, execute: async (args: unknown, context?: ToolContext) => shape(await execute(args, context))}
}

function endingCalls(tool: ChatTool): ChatTool {
  const execute = tool.execute
  if (!execute) return tool
  return {
    ...tool,
    execute: async (args: unknown, context?: ToolContext) => {
      const ended = new AbortController()
      const caller = context?.abortSignal
      const abortSignal = caller === undefined ? ended.signal : AbortSignal.any([caller, ended.signal])
      try {
        return await execute(args, context === undefined ? {abortSignal} : {...context, abortSignal})
      } finally {
        ended.abort()
      }
    },
  }
}

const SECRET_REFUSAL = 'looks like a secret, so code mode refuses to run it'

const FailedRunSchema = z.object({success: z.literal(false), error: z.object({message: z.string()})})

export function readSecretRefusal(result: unknown): string | null {
  const failed = FailedRunSchema.safeParse(result)
  return failed.success && failed.data.error.message.includes(SECRET_REFUSAL) ? failed.data.error.message : null
}

function typeText(schema: Record<string, unknown>, name: string): string {
  const rendered = jsonSchemaToTypeScript(schema, name)
  const prefix = `interface ${rendered.name} `
  return rendered.declaration.startsWith(prefix) ? rendered.declaration.slice(prefix.length) : rendered.name
}

export function describeSchemas(
  input: SchemaInput,
  output: SchemaInput | undefined,
): {input: string; parameters: string[]; output: string} {
  const inputSchema = convertSchemaToJsonSchema(input) ?? {type: 'object', properties: {}}
  const outputSchema = output === undefined ? undefined : convertSchemaToJsonSchema(output)
  return {
    input: typeText({...inputSchema}, 'Input'),
    parameters: Object.keys(inputSchema.properties ?? {}),
    output: outputSchema === undefined ? 'unknown' : typeText({...outputSchema}, 'Output'),
  }
}

export const CodeFilesCapability =
  createCapability<(files: readonly ChatContentPart[]) => void>()('conciv.code-mode-files')

const [, provideCodeFiles] = CodeFilesCapability

type ChildTool = {tool: CodeModeTool; converted: CodeModeTool}

function convertedSchemas(tool: CodeModeTool): ChildTool {
  return {
    tool,
    converted: {
      ...tool,
      inputSchema: convertSchemaToJsonSchema(tool.inputSchema),
      outputSchema: convertSchemaToJsonSchema(tool.outputSchema),
    },
  }
}

function filesContext(files: ChatContentPart[]): Pick<NonNullable<ToolContext>, 'getOptional'> {
  const scope = {capabilities: new CapabilityRegistry()}
  provideCodeFiles(scope, (parts) => files.push(...parts))
  return {getOptional: <Value>(capability: Capability<Value>) => capability[0](scope, {optional: true})}
}

function childCall(
  {tool, converted}: ChildTool,
  secrets: ReadonlyMap<string, string>,
  run: ChatContentPart[][],
): CodeModeTool {
  const execute = tool.execute
  if (!execute) return tool
  return {
    ...converted,
    execute: async (args, context) => {
      const callId = randomUUID()
      const files: ChatContentPart[] = []
      run.push(files)
      context?.emitCustomEvent(codeModeCallEvent.name, {callId, function: tool.name, args})
      try {
        const parameter = secrets.get(`external_${tool.name}`)
        if (parameter !== undefined) {
          throw new Error(`"${tool.name}" takes "${parameter}", which ${SECRET_REFUSAL}`)
        }
        const input = validated(tool.inputSchema, args, `Input validation failed for tool ${tool.name}`)
        const output: unknown = await execute(
          input,
          context === undefined ? undefined : {...context, toolCallId: callId, ...filesContext(files)},
        )
        const result = validated(tool.outputSchema, output, `Output validation failed for tool ${tool.name}`)
        context?.emitCustomEvent(codeModeResultEvent.name, {callId, result})
        return result
      } catch (error) {
        context?.emitCustomEvent(codeModeErrorEvent.name, {
          callId,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  }
}

function validated(schema: SchemaInput | undefined, value: unknown, failure: string): unknown {
  if (schema === undefined || !isStandardSchema(schema)) return value
  try {
    return parseWithStandardSchema(schema, value)
  } catch (error) {
    throw new Error(`${failure}: ${error instanceof Error ? error.message : 'Validation failed'}`, {cause: error})
  }
}

const DISCOVER_DESCRIPTION =
  'Return the full TypeScript signature, description and declared errors of named sandbox capabilities. Pass toolNames: the external_* capability names listed for execute_typescript (the external_ prefix is optional). Call this as its own tool call before writing execute_typescript code that uses those capabilities; it is not available inside the sandbox.'

const SEARCH_DESCRIPTION = 'Search available tools'

const ProgramInputSchema = z.object({typescriptCode: z.string()})

const ExecuteResultSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  logs: z.array(z.string()).optional(),
  error: z
    .object({
      message: z.string(),
      name: z.string().optional(),
      line: z.number().optional(),
      stack: z.string().optional(),
    })
    .optional(),
  files: z.array(ChatContentPartSchema).optional(),
})

export function codeModeTools(
  driver: IsolateDriver,
  tools: readonly ChatTool[],
  search: ((input: unknown) => Promise<unknown>) | null,
  shapeResult: (value: unknown) => unknown,
  debug: DebugConfig,
): CodeModeTools | null {
  const serverTools = tools.filter(isServerTool).map(convertedSchemas)
  if (serverTools.length === 0) return null
  const secrets = new Map<string, string>()
  const config = {
    driver,
    timeout: CODE_MODE_TIMEOUT_MS,
    debug,
    onSecretParameter: (found: {toolName: string; paramPath: string[]}) =>
      secrets.set(found.toolName, found.paramPath.join('.')),
    ...(search === null
      ? {}
      : {
          getSnippetBindings: async () => ({
            search: {
              name: 'search',
              description: SEARCH_DESCRIPTION,
              inputSchema: {type: 'object'},
              execute: (input: unknown) => search(input),
            },
          }),
        }),
  }
  const codeMode = createCodeMode({
    ...config,
    tools: serverTools.map((tool) => childCall(tool, secrets, [])),
    lazyToolsConfig: {includeDescription: 'first-sentence'},
  })
  const program: ChatTool = {
    ...codeMode.tool,
    outputSchema: ExecuteResultSchema,
    execute: async (args: unknown, context?: ToolContext) => {
      const run: ChatContentPart[][] = []
      const {execute} = createCodeModeTool({...config, tools: serverTools.map((each) => childCall(each, secrets, run))})
      if (!execute) throw new Error('the code mode tool has no execute')
      const result = ExecuteResultSchema.parse(await execute(ProgramInputSchema.parse(args), context))
      const files = run.flat()
      return files.length === 0 ? result : {...result, files}
    },
  }
  const execute = withResult(endingCalls(program), shapeResult)
  const discover =
    codeMode.discoveryTool === null ? null : {...codeMode.discoveryTool, description: DISCOVER_DESCRIPTION}
  return {
    tools: discover === null ? [execute] : [execute, discover],
    preface: SANDBOX_PREFACE,
    execute,
    discover,
  }
}
