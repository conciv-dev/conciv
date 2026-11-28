import {Schema} from 'effect'
import {AbsolutePath, optional} from '@conciv/protocol/schema/schema'
import * as ConfigMCP from './config/mcp.js'
import * as ConfigPolicy from './config/policy.js'
import * as ConfigProvider from './config/provider.js'
import * as ConfigWebSearch from './config/websearch.js'

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  policies: ConfigPolicy.Info.pipe(Schema.Array, optional).annotate({
    description: 'Ordered policies controlling access to providers, tools, and integrations',
  }),
  mcp: ConfigMCP.Info.pipe(optional).annotate({
    description: 'MCP server configuration',
  }),
  websearch: ConfigWebSearch.Selection.pipe(optional).annotate({
    description: 'Web search provider selection',
  }),
  providers: Schema.Record(Schema.String, ConfigProvider.Info).pipe(optional),
}).annotate({identifier: 'Config.Info'})

export interface Document extends Schema.Schema.Type<typeof Document> {}
export const Document = Schema.Struct({
  type: Schema.Literal('document'),
  path: AbsolutePath.pipe(optional),
  info: Info,
}).annotate({identifier: 'Config.Document'})

export interface Directory extends Schema.Schema.Type<typeof Directory> {}
export const Directory = Schema.Struct({
  type: Schema.Literal('directory'),
  path: AbsolutePath,
}).annotate({identifier: 'Config.Directory'})

export const Entry = Schema.Union([Document, Directory]).annotate({
  identifier: 'Config.Entry',
})
export type Entry = typeof Entry.Type
