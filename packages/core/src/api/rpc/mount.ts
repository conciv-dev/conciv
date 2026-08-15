import {implement} from '@orpc/server'
import {contract} from '@conciv/contract'
import type {RpcContext} from '@conciv/protocol/rpc-types'
import type {ChatTool} from '@conciv/protocol/chat-types'
import type {EngineStaleness} from '@conciv/contract'
import type {CompositeRpcRouter as CompositeRouterOf} from '@conciv/extension/rpc-mount'
import type {ChatDeps} from '../../chat/runtime.js'
import type {Compactor, Send} from '../../chat/run.js'
import type {OpenSourceFrames, OpenSourceStatus} from '../../editor/open-source.js'
import type {ToolRegistry} from '@conciv/extension/registry'
import type {PageEnv} from '../../page-bus.js'
import type {makeRpcRouter} from './router.js'

export type RpcDeps = {
  chat: ChatDeps
  tools: ChatTool[]
  compactor: Compactor
  send: Send
  openFromFrames: (frames: OpenSourceFrames) => Promise<OpenSourceStatus>
  page: PageEnv
  registry: ToolRegistry
  staleness: () => EngineStaleness
  askTimeoutMs?: number
}

export const os = implement(contract).$context<RpcContext>()

export type CompositeRpcRouter = CompositeRouterOf<ReturnType<typeof makeRpcRouter>>
