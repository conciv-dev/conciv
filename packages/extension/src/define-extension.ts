import type {Component} from 'solid-js'
import type {z} from 'zod'
import type {ThemeTokens} from '@conciv/ui-kit-system'
import type {ToolBuilder} from './define-tool.js'
import type {
  ClientFactoryResult,
  ConfigOf,
  ConnectGate,
  ExtensionCommand,
  ExtensionView,
  RequiredContext,
  ServerApi,
  ServerResult,
} from './types.js'
import {useExtensionValue} from './host-context.js'

export type AnyToolBuilder = ToolBuilder<z.ZodObject<z.ZodRawShape>, unknown>

export type ExtensionMeta<Name extends string, Schema extends z.ZodType, Tools extends readonly AnyToolBuilder[]> = {
  name: Name
  configSchema?: Schema
  tools?: Tools
  commands?: readonly ExtensionCommand[]
  views?: readonly ExtensionView[]
  Component?: Component
  Surface?: Component
  systemPrompt?: string
  theme?: ThemeTokens
  connectGate?: ConnectGate
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
  Surface?: Component
  systemPrompt?: string
  theme?: ThemeTokens
  connectGate?: ConnectGate
  tools?: Tools
  commands?: readonly ExtensionCommand[]
  views?: readonly ExtensionView[]
  parseConfig: (raw: unknown) => ConfigOf<Schema>
  __client?(): ClientFactoryResult<ClientValue>
  __server?(server: ServerApi<ConfigOf<Schema>>): ServerResult<unknown> | Promise<ServerResult<unknown>>
  useContext: {
    (): ClientValue
    <Selected>(select: (context: ClientValue) => Selected): Selected
  }
  client: <Value extends object>(
    factory: () => ClientFactoryResult<Value>,
  ) => ExtensionBuilder<Name, Schema, Tools, ClientValue & Value>
  server: <Context extends RequiredContext<Tools>>(
    factory: (server: ServerApi<ConfigOf<Schema>>) => ServerResult<Context> | Promise<ServerResult<Context>>,
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
  function useContext<Selected>(select?: (context: object) => Selected): object | Selected {
    const value = useExtensionValue(`${meta.name}.useContext`)
    return select ? select(value) : value
  }
  const builder = {
    name: meta.name,
    configSchema: meta.configSchema,
    Component: meta.Component,
    Surface: meta.Surface,
    systemPrompt: meta.systemPrompt,
    theme: meta.theme,
    connectGate: meta.connectGate,
    tools: meta.tools,
    commands: meta.commands,
    views: meta.views,
    parseConfig: (raw: unknown) => parseExtensionConfig(meta.configSchema, raw),
    useContext,
    client(factory: () => ClientFactoryResult<object>) {
      builder.__client = factory
      return builder
    },
    server(factory: (server: ServerApi<ConfigOf<Schema>>) => ServerResult<unknown> | Promise<ServerResult<unknown>>) {
      builder.__server = factory
      return builder
    },
  } as unknown as ExtensionBuilder<Name, Schema, Tools, Record<never, never>>
  return builder
}
