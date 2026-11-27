import type {Plugin as EnginePlugin} from '@conciv/backend-plugin-api'
import type {Context} from '@conciv/frontend-plugin-api'
import type * as Tool from '@conciv/protocol/schema/tool'
import type * as Rpc from '@conciv/protocol/schema/rpc'

export type EngineContext = EnginePlugin.Context

export type BrowserContext = Context

export type ToolDefinition = Tool.Info

export type ToolResult = Tool.Result

export type ToolCallContext = Tool.Context

export type RpcMethod = Rpc.Method
