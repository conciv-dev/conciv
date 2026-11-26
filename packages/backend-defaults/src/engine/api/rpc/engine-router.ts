import type {ContractedRouter} from '@orpc/server'
import type {contract} from '@conciv/protocol'
import type {RpcContext} from '@conciv/types/rpc-types'

type EngineRouter = ContractedRouter<typeof contract, RpcContext>

const engineRouterKey: unique symbol = Symbol('conciv.engineRouter')

export type EngineRouterBrand = {readonly [engineRouterKey]: EngineRouter}

export function carryEngineRouter<T extends object>(value: T, router: EngineRouter): T & EngineRouterBrand {
  const branded = {...value, [engineRouterKey]: router}
  Object.defineProperty(branded, engineRouterKey, {enumerable: false})
  return branded
}

export function readEngineRouter(engine: EngineRouterBrand): EngineRouter {
  return engine[engineRouterKey]
}
