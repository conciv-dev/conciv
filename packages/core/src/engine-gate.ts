import {Hono} from 'hono'
import type {HubInstance} from '@devframes/hub/initiate'
import {NATIVE_PAGE_PATH} from './api/native-page.js'
import {isTrustedBrowserToken} from './devframe-trust.js'
import {corsMiddleware, type CorsVars} from './lib/cors.js'

export type GatedFetch<Env> = (request: Request, env?: Env) => Response | Promise<Response>

export type EngineGateOpts<Env> = {
  fetch: GatedFetch<Env>
  hub: HubInstance
  loginToken: string
  browserLogins: boolean
  allowedOrigins: readonly string[]
}

const TOKEN_PATH = /^\/t\/([^/]+)(\/.*)?$/

export function agentPathFor(loginToken: string): string {
  return `/t/${loginToken}`
}

function isOpenPath(pathname: string, hubBase: string): boolean {
  if (pathname.startsWith(hubBase) || pathname === '/health') return true
  return pathname === NATIVE_PAGE_PATH || pathname.startsWith(`${NATIVE_PAGE_PATH}/`)
}

function refusal(allowedOrigins: readonly string[]): Hono<{Variables: CorsVars}> {
  return new Hono<{Variables: CorsVars}>()
    .use(async (c, next) => {
      c.set('cors', {allowedOrigins: [...allowedOrigins]})
      await next()
    })
    .use(corsMiddleware())
    .all('*', (c) => c.json({message: 'unauthorized'}, 401))
}

export function makeEngineGate<Env>(opts: EngineGateOpts<Env>): GatedFetch<Env> {
  const refuse = refusal(opts.allowedOrigins)
  const accepts = async (token: string): Promise<boolean> => {
    if (token === opts.loginToken) return true
    if (!opts.browserLogins) return false
    return isTrustedBrowserToken(await opts.hub.context, token)
  }
  return async (request, env) => {
    const url = new URL(request.url)
    if (isOpenPath(url.pathname, opts.hub.base)) return opts.fetch(request, env)
    const match = TOKEN_PATH.exec(url.pathname)
    const token = match?.[1]
    if (token === undefined || !(await accepts(token))) return refuse.fetch(request)
    url.pathname = match?.[2] ?? '/'
    return opts.fetch(new Request(url, request), env)
  }
}
