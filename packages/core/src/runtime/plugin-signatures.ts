import {Effect} from 'effect'
import {z} from 'zod'
import {keyBy, omit} from 'es-toolkit'
import type {ToolCommandSignature} from '@conciv/contract'
import {Agent, Permission, Plugin, SessionSchema, Tool, ToolRuntime} from '@conciv/plugin-host'
import type {SessionId} from '@conciv/protocol/chat-types'
import {currentToolDomain} from './permission-cards.js'
import {CLI_HIDDEN_FIELDS, Operations, PAGE_NAMESPACE} from '@conciv/plugin-page/rpc'

const ObjectSchema = z.looseObject({
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
})

const pageOperations = keyBy(Operations, (operation) =>
  ToolRuntime.effectiveName({name: operation.name, options: {namespace: PAGE_NAMESPACE}}),
)

export function isPageTool(name: string): boolean {
  return pageOperations[name] !== undefined
}

function cliInput(schema: unknown) {
  const parsed = ObjectSchema.parse(schema)
  const properties: Record<string, unknown> = omit(parsed.properties ?? {}, CLI_HIDDEN_FIELDS)
  return {
    ...parsed,
    properties,
    required: (parsed.required ?? []).filter((field) => !CLI_HIDDEN_FIELDS.includes(field)),
  }
}

const StringProperty = z.object({type: z.literal('string')})

function stringPositional(input: ReturnType<typeof cliInput>): string | undefined {
  const strings = input.required.filter((field) => StringProperty.safeParse(input.properties[field]).success)
  return strings.length === 1 && input.required.length === 1 ? strings[0] : undefined
}

function signature(
  tool: Parameters<typeof ToolRuntime.definition>[0] & {readonly id: string; readonly pluginId?: string},
): ToolCommandSignature {
  const definition = ToolRuntime.definition(tool)
  const inputSchema = cliInput(definition.inputSchema)
  return {
    name: tool.id,
    path: [tool.id],
    binding: 'server',
    summary: tool.description,
    category: tool.pluginId,
    positional: stringPositional(inputSchema),
    mutating: false,
    reachable: true,
    inputSchema,
    outputSchema: definition.outputSchema,
    errors: [],
  }
}

export const pluginSignatures = Plugin.awaitActivation.pipe(
  Effect.andThen(Tool.Service.use((tools) => tools.list())),
  Effect.map((tools) => tools.map(signature)),
)

export function pluginSignature(name: string) {
  return pluginSignatures.pipe(Effect.map((signatures) => signatures.find((entry) => entry.name === name)))
}

const WIDGET_PRESENT: Permission.Ruleset = [{action: '*', resource: '*', effect: 'allow'}]

export function callPluginTool(
  sessionId: SessionId,
  name: string,
  input: unknown,
  call: {id: string; widget: boolean},
): Effect.Effect<
  Tool.NormalizedResult,
  Tool.Error,
  Plugin.Interface | Tool.Interface | Agent.Interface | Permission.SessionsInterface
> {
  const run = currentToolDomain(sessionId).pipe(
    Effect.flatMap(({snapshot, agent}) => {
      const context: Tool.Context = {
        sessionId: SessionSchema.Id.make(sessionId),
        agent,
        messageId: undefined,
        id: Tool.CallId.make(call.id),
        progress: () => Effect.void,
      }
      return (
        snapshot.codeMode?.execute(name, input, context) ??
        Effect.fail(Tool.makeError({message: `no plugin tool ${name}`}))
      )
    }),
  )
  return call.widget ? run.pipe(Effect.provideService(Permission.Unattended, WIDGET_PRESENT)) : run
}
