import {Effect} from 'effect'
import {z} from 'zod'
import {keyBy, omit} from 'es-toolkit'
import type {ToolCommandSignature} from '@conciv/contract'
import {
  Agent,
  Permission,
  Plugin,
  PluginHooks,
  SessionErrors,
  SessionSchema,
  Tool,
  ToolRuntime,
} from '@conciv/plugin-host'
import type {SessionId} from '@conciv/protocol/chat-types'
import {currentToolDomain} from './permission-cards.js'
import {CLI_HIDDEN_FIELDS, CliTools, Operations, PAGE_NAMESPACE, type AskedPermission} from '@conciv/plugin-page/rpc'

const ObjectSchema = z.looseObject({
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
})

const pageOperations = keyBy(Operations, (operation) =>
  ToolRuntime.effectiveName({name: operation.name, options: {namespace: PAGE_NAMESPACE}}),
)

export function isPageTool(name: string): boolean {
  return CliTools[pageOperations[name]?.name ?? '']?.terminal === true
}

export function askedPagePermission(name: string, input: unknown) {
  return CliTools[pageOperations[name]?.name ?? '']?.asks?.(input)
}

export function pagePermissionAllows(
  sessionId: SessionId,
  asked: AskedPermission,
): Effect.Effect<
  boolean,
  Permission.BlockedError | SessionErrors.NotFoundError,
  Plugin.Interface | Tool.Interface | Agent.Interface | Permission.SessionsInterface | Permission.Interface
> {
  return currentToolDomain(sessionId).pipe(
    Effect.flatMap(({agent}) =>
      Permission.Service.use((permission) => {
        const input: Permission.AssertInput = {
          ...asked,
          sessionId: SessionSchema.Id.make(sessionId),
          agent,
          save: [],
          fallback: 'ask',
        }
        return permission.assertNotDenied(input).pipe(Effect.andThen(permission.allows(input)))
      }),
    ),
  )
}

function cliInput(schema: unknown) {
  const parsed = ObjectSchema.parse(schema)
  return {
    ...parsed,
    properties: omit(parsed.properties ?? {}, CLI_HIDDEN_FIELDS),
    required: (parsed.required ?? []).filter((field) => !CLI_HIDDEN_FIELDS.includes(field)),
  }
}

const StringProperty = z.object({type: z.literal('string')})

function stringPositional(input: ReturnType<typeof cliInput>): string | undefined {
  const strings = input.required.filter((field) => StringProperty.safeParse(input.properties[field]).success)
  return strings.length === 1 && input.required.length === 1 ? strings[0] : undefined
}

function signature(tool: Parameters<typeof ToolRuntime.definition>[0] & {readonly id: string}): ToolCommandSignature[] {
  const definition = ToolRuntime.definition(tool)
  const operation = pageOperations[tool.id]
  const entry = operation === undefined ? undefined : CliTools[operation.name]
  if (operation === undefined || entry === undefined) {
    const inputSchema = cliInput(definition.inputSchema)
    return [
      {
        name: tool.id,
        path: [tool.id],
        binding: 'server',
        summary: tool.description,
        positional: stringPositional(inputSchema),
        mutating: false,
        reachable: true,
        inputSchema,
        outputSchema: definition.outputSchema,
        errors: [],
      },
    ]
  }
  if (!entry.terminal) return []
  return [
    {
      name: tool.id,
      path: [tool.id],
      binding: 'client',
      summary: tool.description,
      category: entry.category,
      positional: entry.positional,
      icon: entry.view.icon,
      label: entry.view.label,
      mutating: operation.mutating,
      reachable: true,
      approval: entry.asks === undefined ? undefined : 'ask',
      inputSchema: cliInput(definition.inputSchema),
      outputSchema: definition.outputSchema,
      errors: [],
    },
  ]
}

export const pluginSignatures = Plugin.awaitActivation.pipe(
  Effect.andThen(Tool.Service.use((tools) => tools.list())),
  Effect.map((tools) => tools.flatMap(signature)),
)

export function pluginSignature(name: string) {
  return pluginSignatures.pipe(Effect.map((signatures) => signatures.find((entry) => entry.name === name)))
}

export function callPluginTool(
  sessionId: SessionId,
  name: string,
  input: unknown,
  callId: string,
): Effect.Effect<
  Tool.NormalizedResult,
  Tool.Error,
  Plugin.Interface | Tool.Interface | Agent.Interface | Permission.SessionsInterface | PluginHooks.Interface
> {
  const admitted = isPageTool(name)
    ? PluginHooks.Service.use((hooks) =>
        hooks.register('permission', 'evaluate', (event) =>
          Effect.sync(() => {
            if (event.source?.id === callId) event.effect = 'allow'
          }),
        ),
      )
    : Effect.void
  return admitted.pipe(
    Effect.andThen(currentToolDomain(sessionId)),
    Effect.flatMap(({snapshot, agent}) => {
      const context: Tool.Context = {
        sessionId: SessionSchema.Id.make(sessionId),
        agent,
        messageId: undefined,
        id: Tool.CallId.make(callId),
        progress: () => Effect.void,
      }
      return (
        snapshot.codeMode?.execute(name, input, context) ??
        Effect.fail(Tool.makeError({message: `no plugin tool ${name}`}))
      )
    }),
    Effect.scoped,
  )
}
