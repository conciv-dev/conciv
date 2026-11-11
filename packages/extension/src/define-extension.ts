import {createMemo, from, type Accessor, type Component} from 'solid-js'
import {z} from 'zod'
import {mapValues} from 'es-toolkit'
import type {RegisteredTools, ToolBinding, ToolBuilder, ToolErrors} from './define-tool.js'
import type {AnyAttachmentBuilder} from './define-attachment.js'
import type {
  ClientFactoryResult,
  ConfigOf,
  ConnectGate,
  ExtensionCommand,
  ExtensionSettingsSchema,
  ExtensionView,
  NoSettings,
  RequiredContext,
  ServerApi,
  ServerResult,
  SettingsOf,
  SettingsReader,
  SettingsStore,
  SystemPromptFactory,
  SystemPromptResolver,
} from './types.js'
import {useExtensionValue} from './host-context.js'
import {useScope} from './use-scope.js'

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
  Settings extends ExtensionSettingsSchema = NoSettings,
> = {
  name: Name
  configSchema?: Schema
  settings?: Settings
  icon?: Component<{class?: string}>
  tools?: Tools
  attachments?: Attachments
  commands?: readonly ExtensionCommand[]
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
  Settings extends ExtensionSettingsSchema = NoSettings,
> = {
  name: Name
  configSchema?: Schema
  settings?: Settings
  icon?: Component<{class?: string}>
  Component?: Component
  Surface?: Component
  systemPrompt?: SystemPromptResolver
  connectGate?: ConnectGate
  tools?: Tools
  attachments?: Attachments
  commands?: readonly ExtensionCommand[]
  views?: readonly ExtensionView[]
  parseConfig: (raw: unknown) => ConfigOf<Schema>
  parseSettings: (raw: unknown) => SettingsOf<Settings>
  readSettings: (store: SettingsStore) => SettingsReader<SettingsOf<Settings>>
  useSettings: () => Accessor<SettingsOf<Settings>>
  __client?(): ClientFactoryResult<ClientValue>
  __server?(
    server: ServerApi<ConfigOf<Schema>, SettingsOf<Settings>>,
  ): ServerResult<unknown> | Promise<ServerResult<unknown>>
  useContext: {
    (): ClientValue
    <Selected>(select: (context: ClientValue) => Selected): Selected
  }
  client: <Value extends object>(
    factory: () => ClientFactoryResult<Value>,
  ) => ExtensionBuilder<Name, Schema, Tools, Attachments, ClientValue & Value, Settings>
  server: <Context extends RequiredContext<readonly [...Tools, ...Attachments]>>(
    factory: (
      server: ServerApi<ConfigOf<Schema>, SettingsOf<Settings>>,
    ) => ServerResult<Context> | Promise<ServerResult<Context>>,
  ) => ExtensionBuilder<Name, Schema, Tools, Attachments, ClientValue, Settings>
}

export type AnyExtension = ExtensionBuilder<
  string,
  z.ZodType,
  readonly AnyToolBuilder[],
  readonly AnyAttachmentBuilder[],
  object,
  ExtensionSettingsSchema
>

export type RegisterExtension<Extension> =
  Extension extends ExtensionBuilder<
    infer Name,
    infer _Schema,
    infer Tools,
    infer _Attachments,
    infer ClientValue,
    infer _Settings
  >
    ? {
        [Key in Name]: {
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
  Settings extends ExtensionSettingsSchema = NoSettings,
>(
  meta: ExtensionMeta<Name, Schema, Tools, Attachments, Settings>,
): ExtensionBuilder<Name, Schema, Tools, Attachments, Record<never, never>, Settings> {
  const parseSettings = lenientSettings(meta.settings)
  const readSettings = (store: SettingsStore): SettingsReader<Record<string, unknown>> => ({
    all: async () => parseSettings(await store.all()),
    onChange: (fn) => store.onChange((value) => fn(parseSettings(value))),
  })
  function useSettings(): Accessor<Record<string, unknown>> {
    const reader = readSettings(useScope<string>(meta.name).settings.project)
    const stored = from<Record<string, unknown>>((set) => {
      const stop = reader.onChange((value) => set(value)).catch(() => () => undefined)
      reader.all().then(
        (value) => set(value),
        () => undefined,
      )
      return () => void stop.then((unsubscribe) => unsubscribe())
    })
    return createMemo(() => stored() ?? parseSettings({}))
  }
  function useContext<Selected>(select?: (context: object) => Selected): object | Selected {
    const value = useExtensionValue(`${meta.name}.useContext`)
    return select ? select(value) : value
  }
  const builder = {
    name: meta.name,
    configSchema: meta.configSchema,
    settings: meta.settings,
    icon: meta.icon,
    Component: meta.Component,
    Surface: meta.Surface,
    systemPrompt: makeSystemPrompt(meta),
    connectGate: meta.connectGate,
    tools: meta.tools,
    attachments: meta.attachments,
    commands: meta.commands,
    views: meta.views,
    parseConfig: (raw: unknown) => parseExtensionConfig(meta.configSchema, raw),
    parseSettings,
    readSettings,
    useSettings,
    useContext,
    client(factory: () => ClientFactoryResult<object>) {
      builder.__client = factory
      return builder
    },
    server(factory: (server: ServerApi<ConfigOf<Schema>>) => ServerResult<unknown> | Promise<ServerResult<unknown>>) {
      builder.__server = factory
      return builder
    },
  } as unknown as ExtensionBuilder<Name, Schema, Tools, Attachments, Record<never, never>, Settings>
  return builder
}

function lenientSettings(schema: ExtensionSettingsSchema | undefined): (raw: unknown) => Record<string, unknown> {
  const lenient = z.object(mapValues(schema?.shape ?? {}, (field) => field.catch(() => field.parse(undefined))))
  const settings = lenient.catch(() => lenient.parse({}))
  return (raw) => settings.parse(raw)
}
