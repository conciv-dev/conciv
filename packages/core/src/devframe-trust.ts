import {getInternalContext} from 'devframe/node/hub-internals'
import type {DevframeNodeContext} from 'devframe/types'

function trustedTokens(ctx: DevframeNodeContext): Record<string, unknown> {
  return getInternalContext(ctx).storage.auth.value().trusted
}

export function isTrustedBrowserToken(ctx: DevframeNodeContext, token: string): boolean {
  return Object.hasOwn(trustedTokens(ctx), token)
}

export function isBrowserCaller(ctx: DevframeNodeContext): boolean {
  const token = ctx.rpc.getCurrentRpcSession()?.meta.clientAuthToken
  if (token === undefined) return false
  return isTrustedBrowserToken(ctx, token)
}

export function isInheritedToken(ctx: DevframeNodeContext, token: string | undefined): boolean {
  if (token === undefined) return false
  const trusted = trustedTokens(ctx)
  return token in trusted && !Object.hasOwn(trusted, token)
}
