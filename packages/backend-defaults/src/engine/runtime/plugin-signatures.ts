import {Effect} from 'effect'
import {z} from 'zod'
import type {ToolCommandSignature} from '@conciv/protocol'
import type * as Identifier from '@conciv/protocol/schema/identifier'
import {Agent, Permission, Plugin, SessionSchema, Tool, ToolRuntime} from '@conciv/backend-app-api'
import type {SessionId} from '@conciv/types/chat-types'
import {currentToolDomain} from './permission-cards.js'

const ObjectSchema = z.looseObject({
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
})

function cliInput(schema: unknown) {
  const parsed = ObjectSchema.parse(schema)
  return {...parsed, properties: parsed.properties ?? {}, required: parsed.required ?? []}
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

export function pluginSignatures() {
  return Plugin.awaitActivation.pipe(
    Effect.andThen(Tool.Service.use((tools) => tools.list())),
    Effect.map((tools) => tools.map((tool) => signature(tool))),
  )
}

export function pluginSignature(name: string) {
  return pluginSignatures().pipe(Effect.map((signatures) => signatures.find((entry) => entry.name === name)))
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
  Plugin.Interface | Tool.Interface | Agent.Interface | Permission.SessionsInterface | Identifier.Maker
> {
  const run = currentToolDomain(sessionId).pipe(
    Effect.flatMap(({snapshot, agent}) => {
      const context: Tool.Context = {
        sessionId: SessionSchema.Id.make(sessionId),
        agent,
        messageId: undefined,
        id: Tool.CallId.make(call.id),
        origin: 'chat',
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
