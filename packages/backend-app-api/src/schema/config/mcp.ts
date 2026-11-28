import {Schema} from 'effect'
import * as Mcp from '@conciv/protocol/schema/mcp'
import {optional} from '@conciv/protocol/schema/schema'

export const Timeout = Mcp.TimeoutConfig
export type Timeout = Mcp.TimeoutConfig
export const Local = Mcp.LocalConfig
export type Local = Mcp.LocalConfig
export const OAuth = Mcp.OAuthConfig
export type OAuth = Mcp.OAuthConfig
export const Remote = Mcp.RemoteConfig
export type Remote = Mcp.RemoteConfig
export const Server = Mcp.ServerConfig
export const Protocol = Mcp.Protocol
export type Protocol = Mcp.Protocol

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  timeout: Timeout.pipe(optional),
  servers: Schema.Record(Schema.String, Server).pipe(optional),
}).annotate({identifier: 'Config.MCP'})
