import {getInternalContext} from 'devframe/node/hub-internals'
import type {DevframeNodeContext} from 'devframe/types'

export function isBrowserCaller(ctx: DevframeNodeContext): boolean {
  const token = ctx.rpc.getCurrentRpcSession()?.meta.clientAuthToken
  if (token === undefined) return false
  return token in getInternalContext(ctx).storage.auth.value().trusted
}
