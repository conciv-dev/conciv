import type {Component} from 'solid-js'
import type {z} from 'zod'
import type {ThemeTokens} from '@mandarax/ui-kit-system'
import type {ToolBuilder} from './define-tool.js'
import type {
  ClientApi,
  ClientFactoryResult,
  ConfigOf,
  ExtensionHostContext,
  ExtensionSlot,
  RequiredContext,
  ServerApi,
  ServerResult,
} from './types.js'
import {useExtensionRuntimeContext} from './runtime-context.js'
import {useClientApi} from './extension-api.js'

export type AnyToolBuilder = ToolBuilder<z.ZodObject<z.ZodRawShape>, unknown>

export type ExtensionMeta<Name extends string, Schema extends z.ZodType, Tools extends readonly AnyToolBuilder[]> = {
  name: Name
  configSchema?: Schema
  tools?: Tools
  Component?: Component
  systemPrompt?: string
  theme?: ThemeTokens
}

export type ExtensionBuilder<
  Name extends string = string,
  Schema extends z.ZodType = z.ZodNever,
  Tools extends readonly AnyToolBuilder[] = readonly AnyToolBuilder[],
  ClientValue extends object = Record<never, never>,
> = {
  name: Name
  configSchema?: Schema
  Component?: Component
  systemPrompt?: string
  theme?: ThemeTokens
  tools?: Tools
  parseConfig: (raw: unknown) => ConfigOf<Schema>
  __client?(): ClientFactoryResult<ClientValue>
  __server?(server: ServerApi<ConfigOf<Schema>>): ServerResult<unknown>
  useClientApi: () => ClientApi
  useSlot: () => () => ExtensionSlot
  useContext: {
    (): ExtensionHostContext & ClientValue
    <Selected>(select: (context: ExtensionHostContext & ClientValue) => Selected): Selected
  }
  client: <Value extends object>(
    factory: () => ClientFactoryResult<Value>,
  ) => ExtensionBuilder<Name, Schema, Tools, ClientValue & Value>
  server: <Context extends RequiredContext<Tools>>(
    factory: (server: ServerApi<ConfigOf<Schema>>) => ServerResult<Context>,
  ) => ExtensionBuilder<Name, Schema, Tools, ClientValue>
}

export type AnyExtension = ExtensionBuilder<string, z.ZodType, readonly AnyToolBuilder[], object>

export type RegisterExtension<Extension> =
  Extension extends ExtensionBuilder<infer Name, infer Schema, infer _Tools, infer _ClientValue>
    ? [Schema] extends [z.ZodNever]
      ? Record<never, never>
      : {[Key in Name]: z.input<Schema>}
    : Record<never, never>

function parseExtensionConfig<Schema extends z.ZodType>(schema: Schema | undefined, raw: unknown): ConfigOf<Schema> {
  return (schema ? schema.parse(raw ?? {}) : {}) as ConfigOf<Schema>
}

export function defineExtension<
  const Name extends string,
  Schema extends z.ZodType = z.ZodNever,
  const Tools extends readonly AnyToolBuilder[] = readonly [],
>(meta: ExtensionMeta<Name, Schema, Tools>): ExtensionBuilder<Name, Schema, Tools, Record<never, never>> {
  function useSlot(): () => ExtensionSlot {
    const context = useExtensionRuntimeContext()
    return () => context.currentSlot
  }
  function useContext<Selected>(select?: (context: ExtensionHostContext) => Selected): ExtensionHostContext | Selected {
    const context = useExtensionRuntimeContext()
    return select ? select(context) : context
  }
  const builder = {
    name: meta.name,
    configSchema: meta.configSchema,
    Component: meta.Component,
    systemPrompt: meta.systemPrompt,
    theme: meta.theme,
    tools: meta.tools,
    parseConfig: (raw: unknown) => parseExtensionConfig(meta.configSchema, raw),
    useClientApi,
    useSlot,
    useContext,
    client(factory: () => ClientFactoryResult<object>) {
      builder.__client = factory
      return builder
    },
    server(factory: (server: ServerApi<ConfigOf<Schema>>) => ServerResult<unknown>) {
      builder.__server = factory
      return builder
    },
  } as unknown as ExtensionBuilder<Name, Schema, Tools, Record<never, never>>
  return builder
}
