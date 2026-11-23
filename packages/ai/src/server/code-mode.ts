import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {uniq} from 'es-toolkit'
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
import {CODE_MODE_EXTERNAL_PREFIX, CODE_MODE_TIMEOUT_MS} from '@conciv/protocol/chat-types'
import {quickJSThreadDriver, type CodeDriver} from './quickjs-thread.js'
import {isApprovalDenied} from './approval-denied.js'
import {inSpan, type Tracer} from './spans.js'

const QUICKJS_MEMORY_LIMIT_MB = 256

const QUICKJS_MAX_STACK_BYTES = 2 * 1024 * 1024

type Log = (message: string) => void

export function loadIsolateDriver(log: Log): CodeDriver | null {
  try {
    return quickJSThreadDriver(
      {timeout: CODE_MODE_TIMEOUT_MS, memoryLimit: QUICKJS_MEMORY_LIMIT_MB, maxStackSize: QUICKJS_MAX_STACK_BYTES},
      log,
    )
  } catch (error) {
    log(`[ai] the code mode driver @tanstack/ai-isolate-quickjs failed to start: ${String(error)}`)
    return null
  }
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

export function tracedDriver(driver: IsolateDriver, tracer: Tracer | undefined): IsolateDriver {
  if (tracer === undefined) return driver
  return {
    createContext: async (config) => {
      const context = await inSpan(tracer, 'CodeMode.createContext', {}, () => driver.createContext(config))
      return {
        execute: (code, options) =>
          inSpan(tracer, 'CodeMode.isolateRun', {'conciv.code.bindings': Object.keys(config.bindings).length}, () =>
            context.execute(code, options),
          ),
        dispose: () => inSpan(tracer, 'CodeMode.disposeContext', {}, () => context.dispose()),
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
  createCapability<(files: readonly ChatContentPart[], text: readonly string[]) => void>()('conciv.code-mode-files')

type CallParts = {files: ChatContentPart[]; text: string[]}

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

function filesContext(parts: CallParts, parent: ToolContext): Pick<NonNullable<ToolContext>, 'getOptional'> {
  const scope = {capabilities: new CapabilityRegistry()}
  provideCodeFiles(scope, (files, text) => {
    parts.files.push(...files)
    parts.text.push(...text)
  })
  return {
    getOptional: <Value>(capability: Capability<Value>) =>
      capability[0](scope, {optional: true}) ?? parent?.getOptional?.(capability),
  }
}

function childCall(
  {tool, converted}: ChildTool,
  secrets: ReadonlyMap<string, string>,
  run: CallParts[],
  tracer: Tracer | undefined,
): CodeModeTool {
  const execute = tool.execute
  if (!execute) return tool
  const callTool = runChildCall(tool, execute, secrets, run)
  return {
    ...converted,
    execute: (args, context) =>
      inSpan(tracer, 'CodeMode.toolCall', {'conciv.tool.name': tool.name}, () => callTool(args, context)),
  }
}

function runChildCall(
  tool: CodeModeTool,
  execute: NonNullable<CodeModeTool['execute']>,
  secrets: ReadonlyMap<string, string>,
  run: CallParts[],
) {
  return async (args: unknown, context?: ToolContext): Promise<unknown> => {
    const callId = randomUUID()
    const parts: CallParts = {files: [], text: []}
    run.push(parts)
    context?.emitCustomEvent(codeModeCallEvent.name, {callId, function: tool.name, args})
    try {
      const parameter = secrets.get(`${CODE_MODE_EXTERNAL_PREFIX}${tool.name}`)
      if (parameter !== undefined) {
        throw new Error(`"${tool.name}" takes "${parameter}", which ${SECRET_REFUSAL}`)
      }
      const input = validated(tool.inputSchema, args, `Input validation failed for tool ${tool.name}`)
      const output: unknown = await execute(
        input,
        context === undefined ? undefined : {...context, toolCallId: callId, ...filesContext(parts, context)},
      )
      const result = validated(tool.outputSchema, output, `Output validation failed for tool ${tool.name}`)
      context?.emitCustomEvent(codeModeResultEvent.name, {callId, result: cardResult(result, parts.files)})
      return result
    } catch (error) {
      context?.emitCustomEvent(codeModeErrorEvent.name, {
        callId,
        error: error instanceof Error ? error.message : String(error),
        ...(isApprovalDenied(error) ? {outcome: 'denied'} : {}),
      })
      throw error
    }
  }
}

function cardResult(result: unknown, files: readonly ChatContentPart[]): unknown {
  if (files.length === 0) return result
  const text =
    result === null ? [] : [{type: 'text', content: typeof result === 'string' ? result : JSON.stringify(result)}]
  return [...text, ...files]
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
  tracer: Tracer | undefined,
  timeoutMs = CODE_MODE_TIMEOUT_MS,
): CodeModeTools | null {
  const serverTools = tools.filter(isServerTool).map(convertedSchemas)
  if (serverTools.length === 0) return null
  const secrets = new Map<string, string>()
  const config = {
    driver,
    timeout: timeoutMs,
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
    tools: serverTools.map((tool) => childCall(tool, secrets, [], tracer)),
    lazyToolsConfig: {includeDescription: 'first-sentence'},
  })
  const program: ChatTool = {
    ...codeMode.tool,
    outputSchema: ExecuteResultSchema,
    execute: (args: unknown, context?: ToolContext) =>
      inSpan(tracer, 'CodeMode.execute', {'conciv.tool.call.id': context?.toolCallId ?? ''}, async () => {
        const run: CallParts[] = []
        const {execute} = createCodeModeTool({
          ...config,
          tools: serverTools.map((each) => childCall(each, secrets, run, tracer)),
        })
        if (!execute) throw new Error('the code mode tool has no execute')
        const result = ExecuteResultSchema.parse(await execute(ProgramInputSchema.parse(args), context))
        const notes = uniq(run.flatMap((parts) => parts.text)).map((content) => ({type: 'text' as const, content}))
        const files = [...notes, ...run.flatMap((parts) => parts.files)]
        return files.length === 0 ? result : {...result, files}
      }),
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
