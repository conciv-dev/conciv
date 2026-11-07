import type {Component} from 'solid-js'
import type {z} from 'zod'
import type {RegisteredTools, ToolBinding, ToolBuilder, ToolErrors} from './define-tool.js'
import type {AnyAttachmentBuilder} from './define-attachment.js'
import type {
  ClientFactoryResult,
  ConfigOf,
  ConnectGate,
  ExtensionCommands,
  ExtensionMigrations,
  ExtensionSourcesFactory,
  ExtensionTables,
  ExtensionTablesFactory,
  ExtensionView,
  RequiredContext,
  ServerApi,
  ServerResult,
  SystemPromptFactory,
  SystemPromptResolver,
} from './types.js'
import {useExtensionValue} from './host-context.js'

export type AnyToolBuilder = ToolBuilder<
  string,
  z.ZodObject<z.ZodRawShape>,
  z.ZodType,
  ToolErrors,
  ToolBinding | undefined,
  unknown
>

export type ExtensionMeta<
  Name extends string,
  Schema extends z.ZodType,
  Tools extends readonly AnyToolBuilder[],
  Attachments extends readonly AnyAttachmentBuilder[] = readonly [],
  Tables extends ExtensionTables = Record<never, never>,
> = {
  name: Name
  configSchema?: Schema
  tools?: Tools
  attachments?: Attachments
  tables?: ExtensionTablesFactory<Tables>
  sources?(tables: Tables): ReturnType<ExtensionSourcesFactory<Tables>>
  migrations?: ExtensionMigrations
  commands?: ExtensionCommands<Tables>
  views?: readonly ExtensionView[]
  Component?: Component
  Surface?: Component
  systemPrompt?: string | SystemPromptFactory<Exclude<ConfigOf<Schema>, undefined>>
  connectGate?: ConnectGate
}

export type ExtensionBuilder<
  Name extends string = string,
  Schema extends z.ZodType = z.ZodNever,
  Tools extends readonly AnyToolBuilder[] = readonly AnyToolBuilder[],
  Attachments extends readonly AnyAttachmentBuilder[] = readonly AnyAttachmentBuilder[],
  ClientValue extends object = Record<never, never>,
  Tables extends ExtensionTables = Record<never, never>,
> = {
  name: Name
  configSchema?: Schema
  Component?: Component
  Surface?: Component
  systemPrompt?: SystemPromptResolver
  connectGate?: ConnectGate
  tools?: Tools
  attachments?: Attachments
  tables?: ExtensionTablesFactory<Tables>
  sources?(tables: Tables): ReturnType<ExtensionSourcesFactory<Tables>>
  migrations?: ExtensionMigrations
  commands?: ExtensionCommands<Tables>
  views?: readonly ExtensionView[]
  parseConfig: (raw: unknown) => ConfigOf<Schema>
  __client?(): ClientFactoryResult<ClientValue>
  __server?(server: ServerApi<ConfigOf<Schema>, Tables>): ServerResult<unknown> | Promise<ServerResult<unknown>>
  useContext: {
    (): ClientValue
    <Selected>(select: (context: ClientValue) => Selected): Selected
  }
  client: <Value extends object>(
    factory: () => ClientFactoryResult<Value>,
  ) => ExtensionBuilder<Name, Schema, Tools, Attachments, ClientValue & Value, Tables>
  server: <Context extends RequiredContext<readonly [...Tools, ...Attachments]>>(
    factory: (server: ServerApi<ConfigOf<Schema>, Tables>) => ServerResult<Context> | Promise<ServerResult<Context>>,
  ) => ExtensionBuilder<Name, Schema, Tools, Attachments, ClientValue, Tables>
}

export type AnyExtension = ExtensionBuilder<
  string,
  z.ZodType,
  readonly AnyToolBuilder[],
  readonly AnyAttachmentBuilder[],
  object,
  Record<never, never>
>

type RegisteredConfig<Schema extends z.ZodType> = [Schema] extends [z.ZodNever] ? never : z.input<Schema>

export type RegisterExtension<Extension> =
  Extension extends ExtensionBuilder<
    infer Name,
    infer Schema,
    infer Tools,
    infer _Attachments,
    infer ClientValue,
    infer _Tables
  >
    ? {
        [Key in Name]: {
          config: RegisteredConfig<Schema>
          context: ClientValue
          tools: RegisteredTools<Tools>
        }
      }
    : Record<never, never>

function parseExtensionConfig<Schema extends z.ZodType>(schema: Schema | undefined, raw: unknown): ConfigOf<Schema> {
  return (schema ? schema.parse(raw ?? {}) : {}) as ConfigOf<Schema>
}

function configuredOrUndefined<Schema extends z.ZodType>(
  schema: Schema | undefined,
  raw: unknown,
): ConfigOf<Schema> | undefined {
  try {
    return parseExtensionConfig(schema, raw)
  } catch {
    return undefined
  }
}

function isConfigured<Config>(config: Config): config is Exclude<Config, undefined> {
  return config !== undefined
}

function makeSystemPrompt<
  Name extends string,
  Schema extends z.ZodType,
  Tools extends readonly AnyToolBuilder[],
  Attachments extends readonly AnyAttachmentBuilder[],
  Tables extends ExtensionTables,
>(meta: ExtensionMeta<Name, Schema, Tools, Attachments, Tables>): SystemPromptResolver | undefined {
  const prompt = meta.systemPrompt
  if (prompt === undefined) return undefined
  return (raw, context) => {
    const config = configuredOrUndefined(meta.configSchema, raw)
    if (!isConfigured(config)) return undefined
    return typeof prompt === 'string' ? prompt : prompt(config, context)
  }
}

export function defineExtension<
  const Name extends string,
  Schema extends z.ZodType = z.ZodNever,
  const Tools extends readonly AnyToolBuilder[] = readonly [],
  const Attachments extends readonly AnyAttachmentBuilder[] = readonly [],
  Tables extends ExtensionTables = Record<never, never>,
>(
  meta: ExtensionMeta<Name, Schema, Tools, Attachments, Tables>,
): ExtensionBuilder<Name, Schema, Tools, Attachments, Record<never, never>, Tables> {
  function useContext<Selected>(select?: (context: object) => Selected): object | Selected {
    const value = useExtensionValue(`${meta.name}.useContext`)
    return select ? select(value) : value
  }
  const builder = {
    name: meta.name,
    configSchema: meta.configSchema,
    Component: meta.Component,
    Surface: meta.Surface,
    systemPrompt: makeSystemPrompt(meta),
    connectGate: meta.connectGate,
    tools: meta.tools,
    attachments: meta.attachments,
    tables: meta.tables,
    sources: meta.sources,
    migrations: meta.migrations,
    commands: meta.commands,
    views: meta.views,
    parseConfig: (raw: unknown) => parseExtensionConfig(meta.configSchema, raw),
    useContext,
    client(factory: () => ClientFactoryResult<object>) {
      builder.__client = factory
      return builder
    },
    server(
      factory: (server: ServerApi<ConfigOf<Schema>, Tables>) => ServerResult<unknown> | Promise<ServerResult<unknown>>,
    ) {
      builder.__server = factory
      return builder
    },
  } as unknown as ExtensionBuilder<Name, Schema, Tools, Attachments, Record<never, never>, Tables>
  return builder
}
