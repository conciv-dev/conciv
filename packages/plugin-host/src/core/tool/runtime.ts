import {type ToolDefinition} from '../../ai/effect.js'
import {Tool} from '../../schema/tool.js'
import type {StandardJSONSchemaV1, StandardSchemaV1} from '@standard-schema/spec'
import {Effect, JsonSchema, Schema} from 'effect'

export const definition = (tool: Tool.Info<any, any>): ToolDefinition => ({
  type: 'tool',
  name: effectiveName(tool),
  description: tool.description,
  inputSchema: inputJsonSchema(tool.input),
  ...(tool.output === undefined ? {} : {outputSchema: outputJsonSchema(tool.output)}),
})

export const execute = (tool: Tool.Info<any, any>, input: unknown, context: Tool.Context) =>
  Effect.gen(function* () {
    const decoded = yield* decodeInput(tool, input)
    const result = yield* tool.execute(decoded, context).pipe(
      Effect.mapError((error: unknown) =>
        error instanceof globalThis.Error && Schema.is(Tool.Error)(error)
          ? error
          : Tool.makeError({
              message: error instanceof globalThis.Error ? error.message : String(error),
            }),
      ),
    )
    if (tool.output === undefined) {
      if ('output' in result) return yield* Effect.die('Tool result declared output without an output schema')
      return {
        output: undefined,
        content: normalizeContent(result.content),
        ...(result.metadata === undefined ? {} : {metadata: result.metadata}),
      }
    }
    if (!('output' in result))
      return yield* Effect.fail(Tool.makeError({message: 'Tool did not return its declared output'}))
    const output = yield* encodeOutput(tool.output, result.output)
    return {
      output,
      content: normalizeContent(result.content, output),
      ...(result.metadata === undefined ? {} : {metadata: result.metadata}),
    }
  })

const decodeInput = (tool: Tool.Info<any, any>, value: unknown) =>
  Effect.gen(function* () {
    const result = yield* validateInput(tool.input, value)
    if (result.issues)
      return yield* Effect.fail(Tool.makeError({message: formatInputIssues(effectiveName(tool), result.issues, value)}))
    return result.value
  })

const validateInput = (
  schema: Tool.ValueSchema<any>,
  value: unknown,
): Effect.Effect<StandardSchemaV1.Result<unknown>> => {
  return validateStandard(schema, value)
}

const formatInputIssues = (tool: string, issues: ReadonlyArray<StandardSchemaV1.Issue>, value: unknown) => {
  const details = issues.slice(0, 5).map((issue) => {
    const path =
      issue.path?.reduce<string>((path, segment) => {
        const key = typeof segment === 'object' ? segment.key : segment
        if (typeof key === 'number') return `${path}[${key}]`
        return path === '' ? String(key) : `${path}.${String(key)}`
      }, '') || 'root'
    return `- ${path}: ${issue.message}`
  })
  if (issues.length > 5) details.push(`- ...and ${issues.length - 5} more ${issues.length === 6 ? 'issue' : 'issues'}`)
  return `Invalid arguments for tool "${tool}":\n${details.join('\n')}\n\nArguments provided:\n${JSON.stringify(value, null, 2)}\n\nUpdate the arguments and call the tool again.`
}

const encodeOutput = (schema: Tool.ValueSchema<any>, value: unknown) => {
  return validateStandard(schema, value).pipe(
    Effect.flatMap((result) =>
      result.issues
        ? Effect.fail(
            Tool.makeError({
              message: `Tool returned an invalid value for its output schema: ${result.issues.map((issue) => issue.message).join(', ')}`,
            }),
          )
        : Effect.succeed(result.value),
    ),
  )
}

const isStandardJSONSchema = (
  schema: StandardSchemaV1<any, any>,
): schema is StandardSchemaV1<any, any> & StandardJSONSchemaV1<any, any> => 'jsonSchema' in schema['~standard']

const validateStandard = (
  schema: StandardSchemaV1<any, any>,
  value: unknown,
): Effect.Effect<StandardSchemaV1.Result<unknown>> =>
  Effect.gen(function* () {
    const result = yield* Effect.try({try: () => schema['~standard'].validate(value), catch: (error) => error})
    return result instanceof Promise
      ? {
          issues: [
            {
              message: `Schema from '${schema['~standard'].vendor}' returned a Promise: async schemas are not supported`,
            },
          ],
        }
      : result
  }).pipe(
    Effect.match({
      onFailure: (error) => ({issues: [{message: error instanceof Error ? error.message : String(error)}]}),
      onSuccess: (result) => result,
    }),
  )

const inputJsonSchema = (schema: Tool.ValueSchema<any>): JsonSchema.JsonSchema => {
  if (schema === undefined || schema === null) return {}
  return standardJsonSchema(schema, 'input')
}

const outputJsonSchema = (schema: Tool.ValueSchema<any>): JsonSchema.JsonSchema => {
  return standardJsonSchema(schema, 'output')
}

const standardJsonSchema = (schema: StandardSchemaV1<any, any>, io: 'input' | 'output'): JsonSchema.JsonSchema => {
  if (isStandardJSONSchema(schema)) return schema['~standard'].jsonSchema[io]({target: 'draft-2020-12'})
  throw new Error(`Schema vendor "${schema['~standard'].vendor}" does not support JSON Schema conversion`)
}

export const normalizeContent = (value: string | ReadonlyArray<Tool.Content> | undefined, output?: unknown) => {
  if (typeof value === 'string') return [{type: 'text' as const, text: value}]
  if (value !== undefined && value.length > 0) return [...value]
  return [{type: 'text' as const, text: stringify(output)}]
}

export const stringify = (value: unknown) => {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

export const normalizedName = (tool: Pick<Tool.Info, 'name'>) => tool.name.replace(/[^a-zA-Z0-9_-]/g, '_')

export const effectiveName = (tool: Pick<Tool.Info, 'name' | 'options'>) =>
  tool.options?.namespace === undefined
    ? normalizedName(tool)
    : `${tool.options.namespace.replaceAll('.', '_')}_${normalizedName(tool)}`
