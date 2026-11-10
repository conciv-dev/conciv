import {randomInt, timingSafeEqual} from 'node:crypto'
import {mkdirSync, watch} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {Hono} from 'hono'
import type {WSContext, WSEvents, WSMessageReceive} from 'hono/ws'
import {REVOKED_SOCKET_CLOSE_CODE, SocketTrustFrameSchema, type ExchangeRefusal} from '@conciv/contract'
import {RPC_PREFIX, type RpcSocketGate, type UpgradeWebSocket} from '@conciv/extension/rpc-mount'
import {rpcHeader, type RpcContext} from '@conciv/protocol/rpc-types'
import {
  TRUSTED_BROWSERS_FILE,
  grantBrowser,
  isMissingFile,
  parseTrustedBrowsers,
  readTrustedBrowsers,
  tokenHash,
  type BrowserRequester,
} from '@conciv/protocol/engine-trust'
import {NATIVE_PAGE_PATH} from './api/native-page.js'
import {os} from './api/rpc/mount.js'
import {corsMiddleware, type CorsVars} from './lib/cors.js'
import {logError} from './lib/debug.js'

export const AUTH_PROCEDURE_PATHS: readonly string[] = [
  '/rpc/auth/trust',
  '/rpc/auth/exchange',
  '/rpc/auth/requestCode',
]

export const OPEN_PATHS: readonly string[] = [
  '/health',
  ...AUTH_PROCEDURE_PATHS,
  NATIVE_PAGE_PATH,
  `${NATIVE_PAGE_PATH}/*`,
]

export const CODE_LIFETIME_MS = 5 * 60 * 1000
export const MAX_CODE_FAILURES = 5
const CODE_LENGTH = 6
const TOKEN_PATH = /^\/t\/([^/]+)(\/.*)?$/
const BEARER = /^Bearer\s+(\S+)$/i

export function isOpenPath(pathname: string): boolean {
  return OPEN_PATHS.some((open) => (open.endsWith('/*') ? pathname.startsWith(open.slice(0, -1)) : pathname === open))
}

export function agentPath(token: string): string {
  return `/t/${token}`
}

export type ExchangeOutcome = 'trusted' | ExchangeRefusal

export type CodeStore = {
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

export function makeCodeStore(deps: {now: () => number; print: (text: string) => void}): CodeStore {
  const state: CodeState = {code: null, expiresAt: 0, failures: 0}
  const live = (): string | null => (state.code !== null && deps.now() < state.expiresAt ? state.code : null)
  const discard = (): void => {
    state.code = null
    state.failures = 0
  }
  return {
    request: (requester, reissue) => {
      if (!reissue && live() !== null) return {expiresAt: state.expiresAt}
      const code = freshCode()
      state.code = code
      state.expiresAt = deps.now() + CODE_LIFETIME_MS
      state.failures = 0
      deps.print(loginBanner(code, state.expiresAt, requester))
      return {expiresAt: state.expiresAt}
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
  grant: (requester: BrowserRequester, grantedAt: number) => string
  hold: (socket: EngineSocket, token: string) => () => void
  close: () => void
}

function loadHashes(stateDir: string): Set<string> {
  try {
    return new Set(readTrustedBrowsers(stateDir).map((entry) => entry.hash))
  } catch (error) {
    logError(`[core] the trusted browsers file could not be read: ${String(error)}`)
    return new Set()
  }
}

async function readHashes(stateDir: string): Promise<Set<string>> {
  const raw = await readFile(join(stateDir, TRUSTED_BROWSERS_FILE), 'utf8').catch((error: unknown) => {
    if (isMissingFile(error)) return null
    throw error
  })
  return new Set(raw === null ? [] : parseTrustedBrowsers(raw).map((entry) => entry.hash))
}

export function watchTrustedBrowsers(stateDir: string): TrustedBrowsers {
  mkdirSync(stateDir, {recursive: true})
  const state = {hashes: loadHashes(stateDir), reloads: Promise.resolve()}
  const sockets = new Map<EngineSocket, string>()
  const reload = (): void => {
    state.reloads = state.reloads
      .then(() => readHashes(stateDir))
      .then(
        (hashes) => {
          state.hashes = hashes
          for (const [socket, hash] of sockets) {
            if (!hashes.has(hash)) socket.close(REVOKED_SOCKET_CLOSE_CODE, 'this browser is no longer trusted')
          }
        },
        (error: unknown) => logError(`[core] the trusted browsers file could not be reloaded: ${String(error)}`),
      )
  }
  const watcher = watch(stateDir, (_event, file) => {
    if (file === TRUSTED_BROWSERS_FILE) reload()
  })
  watcher.on('error', (error) => logError(`[core] watching the trusted browsers file failed: ${String(error)}`))
  return {
    has: (token) => state.hashes.has(tokenHash(token)),
    grant: (requester, grantedAt) => {
      const token = grantBrowser(stateDir, requester, grantedAt)
      state.hashes.add(tokenHash(token))
      return token
    },
    hold: (socket, token) => {
      const hash = tokenHash(token)
      if (!state.hashes.has(hash)) return () => {}
      sockets.set(socket, hash)
      return () => {
        sockets.delete(socket)
      }
    },
    close: () => watcher.close(),
  }
}

export type ConnectionTrust = {
  trusts: (token: string) => boolean
  trustConnection: (socket: EngineSocket, token: string) => (() => void) | null
  refuseUntrusted: (socket: EngineSocket) => void
}

export function makeConnectionTrust(agentToken: string, browsers: TrustedBrowsers): ConnectionTrust {
  const trusts = (token: string): boolean => token !== '' && (sameCode(token, agentToken) || browsers.has(token))
  return {
    trusts,
    trustConnection: (socket, token) => (trusts(token) ? browsers.hold(socket, token) : null),
    refuseUntrusted: (socket) => socket.close(REVOKED_SOCKET_CLOSE_CODE, 'this browser is not trusted'),
  }
}

function parsedFrame(data: WSMessageReceive): unknown {
  if (typeof data !== 'string') return null
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

export function trustingUpgrade(upgrade: UpgradeWebSocket, trust: ConnectionTrust): UpgradeWebSocket {
  return (createEvents) =>
    upgrade((c) => {
      const events: WSEvents = createEvents(c)
      const presented = BEARER.exec(c.req.header('authorization') ?? '')?.[1]
      const connection: {opened: Event | null; release: (() => void) | null} = {opened: null, release: null}
      const admit = (token: string, ws: WSContext): void => {
        connection.release = trust.trustConnection(ws, token)
        if (connection.release === null) {
          trust.refuseUntrusted(ws)
          return
        }
        events.onOpen?.(connection.opened ?? new Event('open'), ws)
      }
      return {
        onOpen: (event, ws) => {
          connection.opened = event
          if (presented !== undefined) admit(presented, ws)
        },
        onMessage: (event, ws) => {
          const frame = SocketTrustFrameSchema.safeParse(parsedFrame(event.data))
          if (connection.release !== null) {
            if (!frame.success) events.onMessage?.(event, ws)
            return
          }
          if (!frame.success) {
            trust.refuseUntrusted(ws)
            return
          }
          admit(frame.data.token, ws)
        },
        onClose: (event, ws) => {
          if (connection.release === null) return
          connection.release()
          events.onClose?.(event, ws)
        },
        onError: (event, ws) => {
          if (connection.release !== null) events.onError?.(event, ws)
        },
      }
    })
}

function isAuthProcedure(path: readonly string[]): boolean {
  return AUTH_PROCEDURE_PATHS.includes(`${RPC_PREFIX}/${path.join('/')}`)
}

type GatedConnection =
  | {phase: 'connecting'}
  | {phase: 'open'; socket: EngineSocket; release: (() => void) | null}
  | {phase: 'closed'}

export function rpcSocketGate(trust: ConnectionTrust, authorization: string | undefined): RpcSocketGate {
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
    open: (socket) => {
      if (connection.current.phase !== 'connecting') return
      connection.current = {phase: 'open', socket, release: null}
      const presented = BEARER.exec(authorization ?? '')?.[1]
      if (presented !== undefined) admit(presented)
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

function requesterOf(context: RpcContext): BrowserRequester {
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
    exchange: os.auth.exchange.handler(({input, context}) => {
      const outcome = deps.codes.exchange(input.code)
      if (outcome !== 'trusted') return {refused: outcome}
      const token = deps.browsers.grant(requesterOf(context), deps.now())
      context.socket?.admit(token)
      return {token}
    }),
    requestCode: os.auth.requestCode.handler(({input, context}) =>
      deps.codes.request(requesterOf(context), input.reissue ?? false),
    ),
  }
}

export type AuthRouter = ReturnType<typeof makeAuthRouter>

export type GatedFetch<Env> = (request: Request, env?: Env) => Response | Promise<Response>

function refusal(allowedOrigins: readonly string[]): Hono<{Variables: CorsVars}> {
  return new Hono<{Variables: CorsVars}>()
    .use(async (c, next) => {
      c.set('cors', {allowedOrigins: [...allowedOrigins]})
      await next()
    })
    .use(corsMiddleware())
    .all('*', (c) => c.json({message: 'unauthorized'}, 401))
}

function presentedToken(
  pathname: string,
  authorization: string | null,
): {token: string | undefined; path: string | undefined} {
  const match = TOKEN_PATH.exec(pathname)
  if (match) return {token: match[1], path: match[2] ?? '/'}
  return {token: BEARER.exec(authorization ?? '')?.[1], path: undefined}
}

function isSocketUpgrade(request: Request): boolean {
  return request.headers.get('upgrade')?.toLowerCase() === 'websocket'
}

function withBearer(request: Request, url: URL, token: string): Request {
  const headers = new Headers(request.headers)
  headers.set('authorization', `Bearer ${token}`)
  return new Request(url, {method: request.method, headers, body: request.body, signal: request.signal, duplex: 'half'})
}

export function makeEngineGate<Env>(opts: {
  fetch: GatedFetch<Env>
  trusts: (token: string) => boolean
  allowedOrigins: readonly string[]
  onTrusted?: () => void
}): GatedFetch<Env> {
  const refuse = refusal(opts.allowedOrigins)
  return (request, env) => {
    const url = new URL(request.url)
    if (isOpenPath(url.pathname)) return opts.fetch(request, env)
    if (request.method === 'OPTIONS') return refuse.fetch(request)
    const presented = presentedToken(url.pathname, request.headers.get('authorization'))
    if (presented.token === undefined && isSocketUpgrade(request)) return opts.fetch(request, env)
    if (presented.token === undefined || !opts.trusts(presented.token)) return refuse.fetch(request)
    opts.onTrusted?.()
    if (presented.path === undefined) return opts.fetch(request, env)
    url.pathname = presented.path
    return opts.fetch(withBearer(request, url, presented.token), env)
  }
}
