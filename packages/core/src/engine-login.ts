import {randomInt, timingSafeEqual} from 'node:crypto'
import {unwatchFile, watchFile} from 'node:fs'
import {join} from 'node:path'
import {Effect} from 'effect'
import {Hono} from 'hono'
import type {WSContext} from 'hono/ws'
import {REVOKED_SOCKET_CLOSE_CODE, type ExchangeRefusal} from '@conciv/contract'
import {RPC_PREFIX, type RpcSocketGate} from '@conciv/serve/rpc'
import {CONCIV_AUTH_TOKEN_QUERY_PARAM, rpcHeader, type RpcContext} from '@conciv/protocol/rpc-types'
import {createConcivStateDir} from '@conciv/protocol/state-types'
import {
  TRUSTED_BROWSERS_FILE,
  grantBrowser,
  readTrustedBrowsers,
  tokenHash,
  type BrowserRequester,
} from '@conciv/protocol/engine-trust'
import {WIDGET_PAGE_PATH} from './api/widget-page.js'
import {os} from './api/rpc/mount.js'
import {corsMiddleware, type CorsVars} from './lib/cors.js'
import type {Log} from './lib/logging.js'

export const AUTH_PROCEDURE_PATHS: readonly string[] = [
  '/rpc/auth/trust',
  '/rpc/auth/exchange',
  '/rpc/auth/requestCode',
]

export const OPEN_PATHS: readonly string[] = [
  '/health',
  ...AUTH_PROCEDURE_PATHS,
  WIDGET_PAGE_PATH,
  `${WIDGET_PAGE_PATH}/*`,
]

export const CODE_LIFETIME_MS = 5 * 60 * 1000
export const MAX_CODE_FAILURES = 5
const CODE_LENGTH = 6

export function isOpenPath(pathname: string): boolean {
  return OPEN_PATHS.some((open) => (open.endsWith('/*') ? pathname.startsWith(open.slice(0, -1)) : pathname === open))
}

export function connectToken(requestUrl: string): string {
  return new URL(requestUrl).searchParams.get(CONCIV_AUTH_TOKEN_QUERY_PARAM) ?? ''
}

export function engineMcpUrl(origin: string, token: string): string {
  const url = new URL('/api/mcp', origin)
  url.searchParams.set(CONCIV_AUTH_TOKEN_QUERY_PARAM, token)
  return url.href
}

export type ExchangeOutcome = 'trusted' | ExchangeRefusal

type IssuedCode = {code: string; expiresAt: number}

export type CodeStore = {
  issue: () => IssuedCode
  request: (requester: BrowserRequester, reissue: boolean) => {expiresAt: number}
  exchange: (code: string) => ExchangeOutcome
}

type CodeState = {code: string | null; expiresAt: number; failures: number}

function sameCode(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function freshCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH)
    .toString()
    .padStart(CODE_LENGTH, '0')
}

function box(lines: readonly string[]): string {
  const width = Math.max(...lines.map((line) => line.length))
  const rule = '─'.repeat(width + 2)
  return [`╭${rule}╮`, ...lines.map((line) => `│ ${line.padEnd(width)} │`), `╰${rule}╯`].join('\n')
}

export function loginBanner(code: string, expiresAt: number, requester: BrowserRequester): string {
  return box([
    'conciv: a browser asks to connect to this engine',
    `From:    ${requester.browser} at ${requester.origin}`,
    `Code:    ${code}`,
    `Link:    ${requester.origin}/#conciv_otp=${code}`,
    `Expires: ${new Date(expiresAt).toLocaleTimeString()}`,
  ])
}

export function makeCodeStore(deps: {now: () => number; log: Log}): CodeStore {
  const state: CodeState = {code: null, expiresAt: 0, failures: 0}
  const live = (): string | null => (state.code !== null && deps.now() < state.expiresAt ? state.code : null)
  const discard = (): void => {
    state.code = null
    state.failures = 0
  }
  const issue = (): IssuedCode => {
    const code = freshCode()
    state.code = code
    state.expiresAt = deps.now() + CODE_LIFETIME_MS
    state.failures = 0
    return {code, expiresAt: state.expiresAt}
  }
  return {
    issue,
    request: (requester, reissue) => {
      if (!reissue && live() !== null) return {expiresAt: state.expiresAt}
      const issued = issue()
      deps.log(
        Effect.logInfo(loginBanner(issued.code, issued.expiresAt, requester)).pipe(
          Effect.annotateLogs({code: issued.code, expiresAt: issued.expiresAt, requester}),
        ),
      )
      return {expiresAt: issued.expiresAt}
    },
    exchange: (code) => {
      const current = live()
      if (current === null) return 'expired'
      if (sameCode(code, current)) {
        discard()
        return 'trusted'
      }
      state.failures += 1
      if (state.failures >= MAX_CODE_FAILURES) discard()
      return 'mismatch'
    },
  }
}

const BROWSERS: readonly [RegExp, string][] = [
  [/Edg\/(\d+)/, 'Edge'],
  [/Firefox\/(\d+)/, 'Firefox'],
  [/Chrome\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[^ ]* Safari/, 'Safari'],
]

const SYSTEMS: readonly [RegExp, string][] = [
  [/iPhone|iPad/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
]

export function describeBrowser(userAgent: string): string {
  const browser = BROWSERS.flatMap(([pattern, name]) => {
    const version = pattern.exec(userAgent)?.[1]
    return version === undefined ? [] : [`${name} ${version}`]
  })[0]
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1]
  if (browser === undefined) return userAgent === '' ? 'unknown client' : userAgent.slice(0, 60)
  return system === undefined ? browser : `${browser} | ${system}`
}

export type EngineSocket = Pick<WSContext, 'close'>

export type TrustedBrowsers = {
  has: (token: string) => boolean
  grant: (requester: BrowserRequester, grantedAt: number) => Promise<string>
  hold: (socket: EngineSocket, token: string) => () => void
  close: () => void
}

const TRUST_FILE_POLL_MS = 250

async function trustedHashes(stateDir: string, log: Log): Promise<Set<string>> {
  try {
    return new Set((await readTrustedBrowsers(stateDir)).map((entry) => entry.hash))
  } catch (error) {
    log(Effect.logError('[core] the trusted browsers file could not be read', {stateDir, error}))
    return new Set()
  }
}

export async function watchTrustedBrowsers(stateDir: string, log: Log): Promise<TrustedBrowsers> {
  await createConcivStateDir(stateDir)
  const sockets = new Map<EngineSocket, string>()
  const trusted = {hashes: await trustedHashes(stateDir, log), turns: Promise.resolve()}
  const inTurn = <T>(run: () => Promise<T>): Promise<T> => {
    const turn = trusted.turns.then(run)
    trusted.turns = turn.then(
      () => undefined,
      () => undefined,
    )
    return turn
  }
  const reread = async (): Promise<void> => {
    trusted.hashes = await trustedHashes(stateDir, log)
  }
  const closeRevoked = (): void => {
    void inTurn(reread).then(() => {
      for (const [socket, hash] of sockets) {
        if (!trusted.hashes.has(hash)) socket.close(REVOKED_SOCKET_CLOSE_CODE, 'this browser is no longer trusted')
      }
    })
  }
  const file = join(stateDir, TRUSTED_BROWSERS_FILE)
  watchFile(file, {interval: TRUST_FILE_POLL_MS, persistent: false}, closeRevoked)
  return {
    has: (token) => trusted.hashes.has(tokenHash(token)),
    grant: (requester, grantedAt) =>
      inTurn(async () => {
        const token = await grantBrowser(stateDir, requester, grantedAt)
        await reread()
        return token
      }),
    hold: (socket, token) => {
      const hash = tokenHash(token)
      if (!trusted.hashes.has(hash)) return () => {}
      sockets.set(socket, hash)
      return () => {
        sockets.delete(socket)
      }
    },
    close: () => unwatchFile(file, closeRevoked),
  }
}

export type ConnectionTrust = {
  trusts: (token: string) => boolean
  isEngine: (token: string) => boolean
  trustConnection: (socket: EngineSocket, token: string) => (() => void) | null
}

export function makeConnectionTrust(agentToken: string, browsers: TrustedBrowsers): ConnectionTrust {
  const isEngine = (token: string): boolean => token !== '' && sameCode(token, agentToken)
  const trusts = (token: string): boolean => isEngine(token) || (token !== '' && browsers.has(token))
  return {
    trusts,
    isEngine,
    trustConnection: (socket, token) => (trusts(token) ? browsers.hold(socket, token) : null),
  }
}

function isAuthProcedure(path: readonly string[]): boolean {
  return AUTH_PROCEDURE_PATHS.includes(`${RPC_PREFIX}/${path.join('/')}`)
}

type GatedConnection =
  | {phase: 'connecting'}
  | {phase: 'open'; socket: EngineSocket; release: (() => void) | null}
  | {phase: 'closed'}

export function rpcSocketGate(trust: ConnectionTrust, connectUrl: string): RpcSocketGate {
  const presented = connectToken(connectUrl)
  const connection: {current: GatedConnection} = {current: {phase: 'connecting'}}
  const admit = (token: string): boolean => {
    const current = connection.current
    if (current.phase !== 'open') return false
    const release = trust.trustConnection(current.socket, token)
    if (release === null) return false
    current.release?.()
    connection.current = {...current, release}
    return true
  }
  const allows = (path: readonly string[]): boolean => {
    const current = connection.current
    if (current.phase === 'closed') return false
    return (current.phase === 'open' && current.release !== null) || isAuthProcedure(path)
  }
  return {
    trust: {allows, admit},
    engineCaller: trust.isEngine(presented),
    open: (socket) => {
      if (connection.current.phase !== 'connecting') return
      connection.current = {phase: 'open', socket, release: null}
      if (presented !== '') admit(presented)
    },
    present: (token) => {
      admit(token)
    },
    close: () => {
      const current = connection.current
      connection.current = {phase: 'closed'}
      if (current.phase === 'open') current.release?.()
    },
  }
}

function describeRequester(context: RpcContext): BrowserRequester {
  return {
    browser: describeBrowser(rpcHeader(context, 'user-agent') ?? ''),
    origin: context.callerOrigin ?? context.origin,
  }
}

export function makeAuthRouter(deps: {
  codes: CodeStore
  trust: ConnectionTrust
  browsers: TrustedBrowsers
  now: () => number
}) {
  return {
    trust: os.auth.trust.handler(({input, context}) => {
      const trusted = deps.trust.trusts(input.token)
      if (trusted) context.socket?.admit(input.token)
      return {trusted}
    }),
    exchange: os.auth.exchange.handler(async ({input, context}) => {
      const outcome = deps.codes.exchange(input.code)
      if (outcome !== 'trusted') return {refused: outcome}
      const token = await deps.browsers.grant(describeRequester(context), deps.now())
      context.socket?.admit(token)
      return {token}
    }),
    requestCode: os.auth.requestCode.handler(({input, context}) =>
      deps.codes.request(describeRequester(context), input.reissue ?? false),
    ),
    issueCode: os.auth.issueCode.handler(({context, errors}) => {
      if (!context.engineCaller) throw errors.FORBIDDEN()
      return deps.codes.issue()
    }),
  }
}

export type AuthRouter = ReturnType<typeof makeAuthRouter>

export type GatedFetch<Env> = (request: Request, env?: Env) => Response | Promise<Response>

function refusal(
  allowedOrigins: readonly string[],
  version: (() => string | undefined) | undefined,
): Hono<{Variables: CorsVars}> {
  return new Hono<{Variables: CorsVars}>()
    .use(async (c, next) => {
      c.set('cors', {allowedOrigins: [...allowedOrigins]})
      await next()
    })
    .use(corsMiddleware(version))
    .all('*', (c) => c.json({message: 'unauthorized'}, 401))
}

function isSocketUpgrade(request: Request): boolean {
  return request.headers.get('upgrade')?.toLowerCase() === 'websocket'
}

export function makeEngineGate<Env>(opts: {
  fetch: GatedFetch<Env>
  trusts: (token: string) => boolean
  allowedOrigins: readonly string[]
  version?: () => string | undefined
  onTrusted?: () => void
}): GatedFetch<Env> {
  const refuse = refusal(opts.allowedOrigins, opts.version)
  return (request, env) => {
    if (isOpenPath(new URL(request.url).pathname)) return opts.fetch(request, env)
    if (request.method === 'OPTIONS') return refuse.fetch(request)
    const presented = connectToken(request.url)
    if (presented === '' && isSocketUpgrade(request)) return opts.fetch(request, env)
    if (!opts.trusts(presented)) return refuse.fetch(request)
    opts.onTrusted?.()
    return opts.fetch(request, env)
  }
}
