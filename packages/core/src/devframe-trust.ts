import {getInternalContext} from 'devframe/node/hub-internals'
import type {DevframeNodeContext} from 'devframe/types'

export function isTrustedBrowserToken(ctx: DevframeNodeContext, token: string): boolean {
  return token in getInternalContext(ctx).storage.auth.value().trusted
}

export function isBrowserCaller(ctx: DevframeNodeContext): boolean {
  const token = ctx.rpc.getCurrentRpcSession()?.meta.clientAuthToken
  if (token === undefined) return false
  return isTrustedBrowserToken(ctx, token)
}
