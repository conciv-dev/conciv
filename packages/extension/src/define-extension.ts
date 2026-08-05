import type {Component} from 'solid-js'
import type {z} from 'zod'
import type {ThemeTokens} from '@conciv/ui-kit-system'
import type {RegisteredTools, ToolBuilder} from './define-tool.js'
import type {AnyAttachmentBuilder} from './define-attachment.js'
import type {
  ClientFactoryResult,
  ConfigOf,
  ConnectGate,
  ExtensionCommand,
  ExtensionView,
  RequiredContext,
  ServerApi,
  ServerResult,
  SystemPromptFactory,
  SystemPromptResolver,
} from './types.js'
import type {PageVerbMap} from './page-verbs.js'
import {useExtensionValue} from './host-context.js'

export type AnyToolBuilder = ToolBuilder<string, z.ZodObject<z.ZodRawShape>, z.ZodType, unknown>

export type ExtensionMeta<
  Name extends string,
  Schema extends z.ZodType,
  Tools extends readonly AnyToolBuilder[],
  Attachments extends readonly AnyAttachmentBuilder[] = readonly [],
> = {
  name: Name
  configSchema?: Schema
  tools?: Tools
  attachments?: Attachments
  commands?: readonly ExtensionCommand[]
  views?: readonly ExtensionView[]
  Component?: Component
  Surface?: Component
  systemPrompt?: string | SystemPromptFactory<Exclude<ConfigOf<Schema>, undefined>>
  theme?: ThemeTokens
  connectGate?: ConnectGate
}

export type ExtensionBuilder<
  Name extends string = string,
  Schema extends z.ZodType = z.ZodNever,
  Tools extends readonly AnyToolBuilder[] = readonly AnyToolBuilder[],
  Attachments extends readonly AnyAttachmentBuilder[] = readonly AnyAttachmentBuilder[],
  ClientValue extends object = Record<never, never>,
  Verbs extends PageVerbMap = Record<never, never>,
> = {
  name: Name
  configSchema?: Schema
  Component?: Component
  Surface?: Component
  systemPrompt?: SystemPromptResolver
  theme?: ThemeTokens
  connectGate?: ConnectGate
  tools?: Tools
  attachments?: Attachments
  commands?: readonly ExtensionCommand[]
  views?: readonly ExtensionView[]
  parseConfig: (raw: unknown) => ConfigOf<Schema>
  __client?(): ClientFactoryResult<ClientValue, Verbs>
  __server?(server: ServerApi<ConfigOf<Schema>, Verbs>): ServerResult<unknown> | Promise<ServerResult<unknown>>
  useContext: {
    (): ClientValue
    <Selected>(select: (context: ClientValue) => Selected): Selected
  }
  client: <Value extends object, ClientVerbs extends PageVerbMap = Record<never, never>>(
    factory: () => ClientFactoryResult<Value, ClientVerbs>,
  ) => ExtensionBuilder<Name, Schema, Tools, Attachments, ClientValue & Value, ClientVerbs>
  pageVerbs: <BoundVerbs extends PageVerbMap>() => ExtensionBuilder<
    Name,
    Schema,
    Tools,
    Attachments,
    ClientValue,
    BoundVerbs
  >
  server: <Context extends RequiredContext<readonly [...Tools, ...Attachments]>>(
    factory: (server: ServerApi<ConfigOf<Schema>, Verbs>) => ServerResult<Context> | Promise<ServerResult<Context>>,
  ) => ExtensionBuilder<Name, Schema, Tools, Attachments, ClientValue, Verbs>
}

export type AnyExtension = ExtensionBuilder<
  string,
  z.ZodType,
  readonly AnyToolBuilder[],
  readonly AnyAttachmentBuilder[],
  object,
  PageVerbMap
>

type RegisteredConfig<Schema extends z.ZodType> = [Schema] extends [z.ZodNever] ? never : z.input<Schema>

export type RegisterExtension<Extension> =
  Extension extends ExtensionBuilder<infer Name, infer Schema, infer Tools, infer _Attachments, infer ClientValue>
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
>(meta: ExtensionMeta<Name, Schema, Tools, Attachments>): SystemPromptResolver | undefined {
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
>(
  meta: ExtensionMeta<Name, Schema, Tools, Attachments>,
): ExtensionBuilder<Name, Schema, Tools, Attachments, Record<never, never>> {
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
    theme: meta.theme,
    connectGate: meta.connectGate,
    tools: meta.tools,
    attachments: meta.attachments,
    commands: meta.commands,
    views: meta.views,
    parseConfig: (raw: unknown) => parseExtensionConfig(meta.configSchema, raw),
    useContext,
    client(factory: () => ClientFactoryResult<object>) {
      builder.__client = factory
      return builder
    },
    pageVerbs() {
      return builder
    },
    server(factory: (server: ServerApi<ConfigOf<Schema>>) => ServerResult<unknown> | Promise<ServerResult<unknown>>) {
      builder.__server = factory
      return builder
    },
  } as unknown as ExtensionBuilder<Name, Schema, Tools, Attachments, Record<never, never>>
  return builder
}
