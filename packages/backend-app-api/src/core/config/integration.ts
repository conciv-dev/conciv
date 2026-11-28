import {Option, Schema, SchemaGetter} from 'effect'
import * as Connection from '@conciv/protocol/schema/connection'
import {IntegrationId} from '@conciv/protocol/schema/integration-id'
import * as Config from '../../schema/config.js'
import * as ConfigPolicy from '../../schema/config/policy.js'

export const Policies = Schema.Array(Schema.Unknown).pipe(
  Schema.decodeTo(Schema.Unknown, {
    decode: SchemaGetter.transform((policies) =>
      policies.filter((policy) => {
        const action = Schema.decodeUnknownOption(Schema.Struct({action: Schema.String}))(policy)
        if (Option.isSome(action) && !Schema.is(ConfigPolicy.Action)(action.value.action)) return false
        const effect = Schema.decodeUnknownOption(Schema.Struct({effect: Schema.String}))(policy)
        return Option.isNone(effect) || Schema.is(ConfigPolicy.Effect)(effect.value.effect)
      }),
    ),
    encode: SchemaGetter.passthrough({strict: false}),
  }),
  Schema.decodeTo(Schema.Array(ConfigPolicy.Info)),
)

export const Remote = Schema.Struct({
  providers: Config.Info.fields.providers,
  mcp: Config.Info.fields.mcp,
  policies: Policies.pipe(Schema.optional),
  websearch: Config.Info.fields.websearch,
})
export type Remote = typeof Remote.Type

export interface Document extends Schema.Schema.Type<typeof Document> {}
export const Document = Schema.Struct({
  ...Config.Document.fields,
  integrationId: IntegrationId,
  connection: Connection.Info,
  organization: Schema.optional(Schema.String),
}).annotate({identifier: 'Config.IntegrationDocument'})

export interface WellKnownDocument extends Schema.Schema.Type<typeof WellKnownDocument> {}
export const WellKnownDocument = Schema.Struct({
  ...Config.Document.fields,
  integrationId: IntegrationId,
}).annotate({identifier: 'Config.WellKnownDocument'})

const isIntegrationDocument = Schema.is(Document)
const isWellKnownDocument = (entry: Config.Entry | Document | WellKnownDocument): entry is WellKnownDocument =>
  Schema.is(WellKnownDocument)(entry) && !isIntegrationDocument(entry)

export function suppliers(entries: readonly (Config.Entry | Document | WellKnownDocument)[]) {
  return new Map(
    entries
      .filter(isWellKnownDocument)
      .flatMap((document) => Object.keys(document.info.providers ?? {}).map((id) => [id, document.integrationId])),
  )
}

export function make(input: {
  readonly integrationId: IntegrationId
  readonly connection: Connection.Info
  readonly organization?: string
  readonly info: Remote
}) {
  const servers = input.info.mcp?.servers
  return Document.make({
    type: 'document',
    integrationId: input.integrationId,
    connection: input.connection,
    organization: input.organization,
    info: {
      providers:
        input.info.providers &&
        Object.fromEntries(
          Object.entries(input.info.providers).map(([id, provider]) => [
            id,
            {
              ...provider,
              env: undefined,
              settings: withoutCredentials(provider.settings),
              models:
                provider.models &&
                Object.fromEntries(
                  Object.entries(provider.models).map(([modelId, model]) => [
                    modelId,
                    {
                      ...model,
                      settings: withoutCredentials(model.settings),
                      variants: model.variants?.map((variant) => ({
                        ...variant,
                        settings: withoutCredentials(variant.settings),
                      })),
                    },
                  ]),
                ),
            },
          ]),
        ),
      mcp: servers && {
        servers: Object.fromEntries(Object.entries(servers).filter(([, server]) => server.type === 'remote')),
      },
      policies: input.info.policies,
      websearch: input.info.websearch,
    },
  })
}

function withoutCredentials<Value>(settings: Readonly<Record<string, Value>> | undefined) {
  return (
    settings &&
    Object.fromEntries(
      Object.entries(settings).filter(([key]) => !['apiKey', 'authToken', 'accessToken'].includes(key)),
    )
  )
}
