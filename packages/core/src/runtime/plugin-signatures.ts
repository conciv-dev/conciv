import {Effect} from 'effect'
import {z} from 'zod'
import {keyBy, omit} from 'es-toolkit'
import type {ToolCommandSignature} from '@conciv/contract'
import {Plugin, Tool, ToolRuntime} from '@conciv/plugin-host'
import {CLI_HIDDEN_FIELDS, CliTools, Operations, PAGE_NAMESPACE} from '@conciv/plugin-page/rpc'

const ObjectSchema = z.looseObject({
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
})

const pageOperations = keyBy(Operations, (operation) =>
  ToolRuntime.effectiveName({name: operation.name, options: {namespace: PAGE_NAMESPACE}}),
)

function cliInput(schema: unknown) {
  const parsed = ObjectSchema.parse(schema)
  return {
    ...parsed,
    properties: omit(parsed.properties ?? {}, CLI_HIDDEN_FIELDS),
    required: (parsed.required ?? []).filter((field) => !CLI_HIDDEN_FIELDS.includes(field)),
  }
}

function signature(tool: Parameters<typeof ToolRuntime.definition>[0] & {readonly id: string}): ToolCommandSignature[] {
  const operation = pageOperations[tool.id]
  const entry = operation === undefined ? undefined : CliTools[operation.name]
  if (operation === undefined || entry === undefined || !entry.terminal) return []
  const definition = ToolRuntime.definition(tool)
  return [
    {
      name: tool.id,
      path: [tool.id],
      binding: 'client',
      summary: tool.description,
      category: entry.category,
      positional: entry.positional,
      mutating: operation.mutating,
      reachable: true,
      approval: entry.asks ? 'ask' : undefined,
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
