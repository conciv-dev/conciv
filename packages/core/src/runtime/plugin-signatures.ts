import {Effect} from 'effect'
import {z} from 'zod'
import type {ToolCommandSignature} from '@conciv/contract'
import {Agent, Permission, Plugin, SessionSchema, Tool, ToolRuntime} from '@conciv/plugin-host'
import type {SessionId} from '@conciv/protocol/chat-types'
import {currentToolDomain} from './permission-cards.js'

const ObjectSchema = z.looseObject({
  properties: z.record(z.string(), z.unknown()).default({}),
  required: z.array(z.string()).default([]),
})

const StringProperty = z.object({type: z.literal('string')})

function stringPositional(input: z.infer<typeof ObjectSchema>): string | undefined {
  const strings = input.required.filter((field) => StringProperty.safeParse(input.properties[field]).success)
  return strings.length === 1 && input.required.length === 1 ? strings[0] : undefined
}

function signature(
  tool: Parameters<typeof ToolRuntime.definition>[0] & {readonly id: string; readonly pluginId?: string},
): ToolCommandSignature {
  const definition = ToolRuntime.definition(tool)
  const inputSchema = ObjectSchema.parse(definition.inputSchema)
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
  call: {id: string; widget: boolean; outside: boolean},
): Effect.Effect<
  Tool.NormalizedResult,
  Tool.Error,
  Plugin.Interface | Tool.Interface | Agent.Interface | Permission.SessionsInterface
> {
  const run = currentToolDomain(sessionId, {outside: call.outside}).pipe(
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
