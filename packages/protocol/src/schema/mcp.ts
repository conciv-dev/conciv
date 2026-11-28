import {Schema} from 'effect'
import {optional, PositiveInt} from './schema.js'
import {IntegrationId} from './integration-id.js'

export interface TimeoutConfig extends Schema.Schema.Type<typeof TimeoutConfig> {}
export const TimeoutConfig = Schema.Struct({
  startup: PositiveInt.pipe(optional).annotate({
    description: 'Maximum time in milliseconds to establish and initialize the MCP server.',
  }),
  catalog: PositiveInt.pipe(optional).annotate({
    description: 'Maximum time in milliseconds to wait for MCP discovery requests such as tools/list and prompts/list.',
  }),
  execution: PositiveInt.pipe(optional).annotate({
    description: 'Maximum time in milliseconds to wait for MCP tool and prompt execution.',
  }),
}).annotate({identifier: 'Mcp.TimeoutConfig'})

export type Protocol = typeof Protocol.Type
export const Protocol = Schema.Literals(['legacy', 'auto', '2026-07-28']).annotate({
  identifier: 'Mcp.Protocol',
  description:
    'MCP protocol negotiation. "legacy" (default) opens with the initialize handshake and speaks protocol revisions up to 2025-11-25. "auto" probes for the 2026-07-28 revision and falls back to legacy when the server does not support it. "2026-07-28" requires that revision and fails otherwise.',
})

const pool = Schema.Boolean.pipe(optional).annotate({
  description:
    'Share one connection to this server across every directory that configures it identically, instead of one per directory. Only connections that negotiate the 2026-07-28 revision are shared; an unset "protocol" becomes "auto", and "legacy" never shares. Defaults to false.',
})

const codemode = Schema.Boolean.pipe(optional).annotate({
  description: "Expose this server's tools through Code Mode. Defaults to true.",
})

export interface LocalConfig extends Schema.Schema.Type<typeof LocalConfig> {}
export const LocalConfig = Schema.Struct({
  type: Schema.Literal('local'),
  command: Schema.String.pipe(Schema.Array),
  cwd: Schema.String.pipe(optional).annotate({
    description: 'Working directory for the MCP server process. Relative paths resolve from the workspace directory.',
  }),
  environment: Schema.Record(Schema.String, Schema.String).pipe(optional),
  disabled: Schema.Boolean.pipe(optional),
  codemode,
  timeout: TimeoutConfig.pipe(optional),
  protocol: Protocol.pipe(optional),
  pool,
}).annotate({identifier: 'Mcp.LocalConfig'})

export interface OAuthConfig extends Schema.Schema.Type<typeof OAuthConfig> {}
export const OAuthConfig = Schema.Struct({
  client_id: Schema.String.pipe(optional),
  client_secret: Schema.String.pipe(optional),
  scope: Schema.String.pipe(optional),
  callback_port: Schema.Int.check(Schema.isBetween({minimum: 1, maximum: 65535})).pipe(optional),
  redirect_uri: Schema.String.pipe(optional),
  auth_server_metadata_url: Schema.String.pipe(optional).annotate({
    description:
      'URL of the OAuth or OpenID Connect authorization server metadata document. Set when the MCP server does not publish protected resource metadata that names its authorization server.',
  }),
}).annotate({identifier: 'Mcp.OAuthConfig'})

export interface RemoteConfig extends Schema.Schema.Type<typeof RemoteConfig> {}
export const RemoteConfig = Schema.Struct({
  type: Schema.Literal('remote'),
  url: Schema.String,
  headers: Schema.Record(Schema.String, Schema.String).pipe(optional),
  oauth: Schema.Union([OAuthConfig, Schema.Literal(false)]).pipe(optional),
  disabled: Schema.Boolean.pipe(optional),
  codemode,
  timeout: TimeoutConfig.pipe(optional),
  protocol: Protocol.pipe(optional),
  pool,
}).annotate({identifier: 'Mcp.RemoteConfig'})

export const ServerConfig = Schema.Union([LocalConfig, RemoteConfig]).pipe(Schema.toTaggedUnion('type'))
export type ServerConfig = typeof ServerConfig.Type

const Connected = Schema.Struct({status: Schema.Literal('connected')}).annotate({
  identifier: 'Mcp.Status.Connected',
})
const Pending = Schema.Struct({status: Schema.Literal('pending')}).annotate({
  identifier: 'Mcp.Status.Pending',
})
const Disabled = Schema.Struct({status: Schema.Literal('disabled')}).annotate({
  identifier: 'Mcp.Status.Disabled',
})
const Failed = Schema.Struct({status: Schema.Literal('failed'), error: Schema.String}).annotate({
  identifier: 'Mcp.Status.Failed',
})
const NeedsAuth = Schema.Struct({status: Schema.Literal('needs_auth'), error: Schema.String}).annotate({
  identifier: 'Mcp.Status.NeedsAuth',
})

export type Status = typeof Status.Type
export const Status = Schema.Union([Connected, Pending, Disabled, Failed, NeedsAuth]).pipe(
  Schema.toTaggedUnion('status'),
)

export const SubscriptionStatus = Schema.Union([
  Schema.Struct({status: Schema.Literal('pending')}),
  Schema.Struct({status: Schema.Literal('active')}),
  Schema.Struct({status: Schema.Literal('ended'), reason: Schema.Literal('unavailable')}),
  Schema.Struct({
    status: Schema.Literal('ended'),
    reason: Schema.Literals(['terminated', 'rejected']),
    error: Schema.Struct({code: Schema.Number, message: Schema.String}),
  }),
]).annotate({identifier: 'Mcp.SubscriptionStatus'})
export type SubscriptionStatus = typeof SubscriptionStatus.Type

export interface Server extends Schema.Schema.Type<typeof Server> {}
export const Server = Schema.Struct({
  name: Schema.String,
  status: Status,
  title: optional(Schema.String),
  integrationId: optional(IntegrationId),
}).annotate({identifier: 'Mcp.Server'})

export interface Resource extends Schema.Schema.Type<typeof Resource> {}
export const Resource = Schema.Struct({
  server: Schema.String,
  name: Schema.String,
  uri: Schema.String,
  description: optional(Schema.String),
  mimeType: optional(Schema.String),
}).annotate({identifier: 'Mcp.Resource'})

export interface ResourceTemplate extends Schema.Schema.Type<typeof ResourceTemplate> {}
export const ResourceTemplate = Schema.Struct({
  server: Schema.String,
  name: Schema.String,
  uriTemplate: Schema.String,
  description: optional(Schema.String),
  mimeType: optional(Schema.String),
}).annotate({identifier: 'Mcp.ResourceTemplate'})

export interface ResourceCatalog extends Schema.Schema.Type<typeof ResourceCatalog> {}
export const ResourceCatalog = Schema.Struct({
  resources: Schema.Array(Resource),
  templates: Schema.Array(ResourceTemplate),
}).annotate({identifier: 'Mcp.ResourceCatalog'})

export const ResourceContentPart = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('text'),
    uri: Schema.String,
    text: Schema.String,
    mimeType: optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal('blob'),
    uri: Schema.String,
    blob: Schema.String,
    mimeType: optional(Schema.String),
  }),
]).pipe(Schema.toTaggedUnion('type'), Schema.annotate({identifier: 'Mcp.ResourceContentPart'}))
export type ResourceContentPart = typeof ResourceContentPart.Type

export interface ResourceContent extends Schema.Schema.Type<typeof ResourceContent> {}
export const ResourceContent = Schema.Struct({
  server: Schema.String,
  uri: Schema.String,
  contents: Schema.Array(ResourceContentPart),
}).annotate({identifier: 'Mcp.ResourceContent'})
