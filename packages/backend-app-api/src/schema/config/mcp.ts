import {Schema} from 'effect'
import {optional, PositiveInt} from '@conciv/protocol/schema/schema'

export interface Timeout extends Schema.Schema.Type<typeof Timeout> {}
export const Timeout = Schema.Struct({
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

export interface Local extends Schema.Schema.Type<typeof Local> {}
export const Local = Schema.Struct({
  type: Schema.Literal('local'),
  command: Schema.String.pipe(Schema.Array),
  cwd: Schema.String.pipe(optional).annotate({
    description: 'Working directory for the MCP server process. Relative paths resolve from the workspace directory.',
  }),
  environment: Schema.Record(Schema.String, Schema.String).pipe(optional),
  disabled: Schema.Boolean.pipe(optional),
  codemode,
  timeout: Timeout.pipe(optional),
  protocol: Protocol.pipe(optional),
  pool,
}).annotate({identifier: 'Mcp.LocalConfig'})

export interface OAuth extends Schema.Schema.Type<typeof OAuth> {}
export const OAuth = Schema.Struct({
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

export interface Remote extends Schema.Schema.Type<typeof Remote> {}
export const Remote = Schema.Struct({
  type: Schema.Literal('remote'),
  url: Schema.String,
  headers: Schema.Record(Schema.String, Schema.String).pipe(optional),
  oauth: Schema.Union([OAuth, Schema.Literal(false)]).pipe(optional),
  disabled: Schema.Boolean.pipe(optional),
  codemode,
  timeout: Timeout.pipe(optional),
  protocol: Protocol.pipe(optional),
  pool,
}).annotate({identifier: 'Mcp.RemoteConfig'})

export const Server = Schema.Union([Local, Remote]).pipe(Schema.toTaggedUnion('type'))
export type Server = typeof Server.Type

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  timeout: Timeout.pipe(optional),
  servers: Schema.Record(Schema.String, Server).pipe(optional),
}).annotate({identifier: 'Config.MCP'})
