import {randomInt, timingSafeEqual} from 'node:crypto'
import {mkdirSync, watch} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {Hono, type MiddlewareHandler} from 'hono'
import {z} from 'zod'
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
import {corsMiddleware, type CorsVars} from './lib/cors.js'
import {logError} from './lib/debug.js'

export const OPEN_PATHS: readonly string[] = [
  '/health',
  '/auth/check',
  '/auth/code',
  '/auth/exchange',
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

export type ExchangeOutcome = 'trusted' | 'mismatch' | 'expired'

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

export type EngineTrust = (token: string) => boolean

export type TrustedBrowsers = {
  has: (token: string) => boolean
  grant: (requester: BrowserRequester, grantedAt: number) => string
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
  const reload = (): void => {
    state.reloads = state.reloads
      .then(() => readHashes(stateDir))
      .then(
        (hashes) => {
          state.hashes = hashes
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
    close: () => watcher.close(),
  }
}

export function makeEngineTrust(agentToken: string, browsers: TrustedBrowsers): EngineTrust {
  return (token) => sameCode(token, agentToken) || browsers.has(token)
}

function requesterOf(request: Request): BrowserRequester {
  return {
    browser: describeBrowser(request.headers.get('user-agent') ?? ''),
    origin: request.headers.get('origin') ?? new URL(request.url).origin,
  }
}

const JSON_CONTENT = /^application\/json(\s*;|$)/i

const requireJson: MiddlewareHandler = async (c, next) => {
  if (!JSON_CONTENT.test(c.req.header('content-type') ?? '')) return c.json({message: 'json required'}, 415)
  await next()
}

const CheckSchema = z.object({token: z.string().min(1).max(512)})
const CodeRequestSchema = z.object({reissue: z.boolean().optional()})
const ExchangeSchema = z.object({code: z.string().regex(/^\d{6}$/)})

async function jsonBody(request: Request): Promise<unknown> {
  return request.json().catch(() => null)
}

export function authRoutes(deps: {
  codes: CodeStore
  trusted: EngineTrust
  browsers: TrustedBrowsers
  now: () => number
}) {
  return new Hono()
    .use('/auth/code', requireJson)
    .use('/auth/exchange', requireJson)
    .post('/auth/check', async (c) => {
      const parsed = CheckSchema.safeParse(await jsonBody(c.req.raw))
      if (!parsed.success) return c.json({message: 'a token is required'}, 400)
      return c.json({trusted: deps.trusted(parsed.data.token)})
    })
    .post('/auth/code', async (c) => {
      const parsed = CodeRequestSchema.safeParse(await jsonBody(c.req.raw))
      if (!parsed.success) return c.json({message: 'reissue must be a boolean'}, 400)
      const requester = requesterOf(c.req.raw)
      return c.json(deps.codes.request(requester, parsed.data.reissue ?? false))
    })
    .post('/auth/exchange', async (c) => {
      const parsed = ExchangeSchema.safeParse(await jsonBody(c.req.raw))
      if (!parsed.success) return c.json({reason: 'mismatch'}, 401)
      const outcome = deps.codes.exchange(parsed.data.code)
      if (outcome !== 'trusted') return c.json({reason: outcome}, 401)
      const requester = requesterOf(c.req.raw)
      return c.json({token: deps.browsers.grant(requester, deps.now())})
    })
}

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

export function makeEngineGate<Env>(opts: {
  fetch: GatedFetch<Env>
  trusted: EngineTrust
  allowedOrigins: readonly string[]
  onTrusted?: () => void
}): GatedFetch<Env> {
  const refuse = refusal(opts.allowedOrigins)
  return (request, env) => {
    const url = new URL(request.url)
    if (isOpenPath(url.pathname)) return opts.fetch(request, env)
    const presented = presentedToken(url.pathname, request.headers.get('authorization'))
    if (presented.token === undefined || !opts.trusted(presented.token)) return refuse.fetch(request)
    opts.onTrusted?.()
    if (presented.path === undefined) return opts.fetch(request, env)
    url.pathname = presented.path
    return opts.fetch(new Request(url, request), env)
  }
}
