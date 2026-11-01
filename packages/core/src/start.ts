import {randomUUID} from 'node:crypto'
import {serveHono, type ClaimUpgrade, type ServeFetch} from '@conciv/serve'
import {Hono} from 'hono'
import {z} from 'zod'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {HarnessAdapter} from '@conciv/harness'
import {isConcivPlugin, type AnyExtension, type ConcivPlugin, type ExtensionPromptContext} from '@conciv/extension'
import type {HubInstance} from '@devframes/hub/initiate'
import {makeApp, withBuiltinExtensions, type MakeAppOpts} from './app.js'

export type {AppType} from './app.js'
import {makeEditorOpener} from './editor/open.js'
import {resolveConfig, type ConcivConfig, type ResolvedConcivConfig} from './config.js'
import {statePaths} from './lib/state-paths.js'
import {writeText} from './lib/fs.js'
import {isAddressInUse, readPersistedPort, writePersistedPort} from './lib/server-port.js'
import {defaultDevEndpointDir, removeDevEndpoint, writeDevEndpoint, writePrivateFile} from './lib/dev-endpoint.js'
import {claudeConnectEndpointFile} from '@conciv/harness-init/claude/endpoint'
import type {SessionId} from '@conciv/protocol/chat-types'

export type PortRequest = {exact: number} | {preferred: number}

export type StartOpts = {
  options: ConcivConfig
  root: string
  bridge?: BundlerBridge
  launchEditor: (file: string, line: number) => void
  childEnv?: (corePort: number) => NodeJS.ProcessEnv
  port?: PortRequest

  allowedOrigins?: string[]
  accessToken?: string
  onClientRequest?: () => void
  onShutdown?: () => void

  extensions?: (AnyExtension | ConcivPlugin)[]
  harness?: HarnessAdapter
  nativePageDir?: string
  devEndpointDir?: string
}

export type Engine = {
  port: number
  apiBase: string
  hub: HubInstance
  stop: () => Promise<void>
  cfg: ResolvedConcivConfig
  extensionContexts: Record<string, unknown>
}

type Served = Awaited<ReturnType<typeof serveHono>>
type Listener = {fetch: ServeFetch; claimUpgrade: ClaimUpgrade}

const PERSISTED_PORT_ATTEMPTS = 4
const PERSISTED_PORT_RETRY_MS = 300
const accessTokenMessage = 'conciv: accessToken must be a UUID pairing token'
const AccessTokenSchema = z.uuid(accessTokenMessage).optional()

function assertAccessToken(accessToken: string | undefined): void {
  const parsed = AccessTokenSchema.safeParse(accessToken)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? accessTokenMessage)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function reservePort(listener: Listener, port: number): Promise<Served | undefined> {
  for (let attempt = 0; attempt < PERSISTED_PORT_ATTEMPTS; attempt++) {
    try {
      return await serveHono({...listener, port})
    } catch (error) {
      if (!isAddressInUse(error)) throw error
      if (attempt < PERSISTED_PORT_ATTEMPTS - 1) await delay(PERSISTED_PORT_RETRY_MS)
    }
  }
  return undefined
}

async function servePersistedPort(listener: Listener, stateFile: string): Promise<Served> {
  const persisted = readPersistedPort(stateFile)
  const reused = persisted === undefined ? undefined : await reservePort(listener, persisted)
  if (reused) return reused
  return serveHono({...listener, port: 0})
}

async function servePreferredPort(listener: Listener, preferred: number): Promise<Served> {
  const reserved = await reservePort(listener, preferred)
  if (reserved) return reserved
  const serving = await serveHono({...listener, port: 0})
  console.warn(
    `conciv: port ${preferred} is already in use, the engine is listening on http://127.0.0.1:${serving.port} instead`,
  )
  return serving
}

function serveRequestedPort(listener: Listener, request: PortRequest | undefined, stateFile: string): Promise<Served> {
  if (request === undefined) return servePersistedPort(listener, stateFile)
  if ('exact' in request) return serveHono({...listener, port: request.exact})
  return servePreferredPort(listener, request.preferred)
}

async function servePort(listener: Listener, request: PortRequest | undefined, stateFile: string): Promise<Served> {
  const serving = await serveRequestedPort(listener, request, stateFile)
  writePersistedPort(stateFile, serving.port)
  return serving
}

function onceNotifier(callback?: () => void): () => void {
  let fired = false
  return () => {
    if (fired || !callback) return
    fired = true
    callback()
  }
}

export type ComposePromptOpts = ExtensionPromptContext & {extensions?: Record<string, unknown>}

export function composeSystemPrompt(
  base: string | undefined,
  extensions: readonly Pick<AnyExtension, 'name' | 'systemPrompt'>[],
  opts: ComposePromptOpts,
): string {
  const prompts = extensions.map((extension) => extension.systemPrompt?.(opts.extensions?.[extension.name], opts))
  return [base, ...prompts].filter(Boolean).join('\n\n')
}

export async function start(opts: StartOpts): Promise<Engine> {
  assertAccessToken(opts.accessToken)
  const cfg = resolveConfig(opts.options, opts.root)
  const paths = statePaths(cfg.stateRoot)

  const loaded = opts.extensions ?? []
  const plugins = loaded.filter(isConcivPlugin)
  const extensions = loaded.filter((extension): extension is AnyExtension => !isConcivPlugin(extension))
  const systemPrompt = composeSystemPrompt(cfg.systemPrompt, [...withBuiltinExtensions(extensions), ...plugins], {
    cwd: opts.root,
    extensions: cfg.extensions,
  })
  if (systemPrompt) writeText(paths.systemPrompt, systemPrompt)

  const openInEditor = makeEditorOpener(
    (file, line) => opts.launchEditor(file, line),
    4000,
    () => Date.now(),
  )

  const portRef = {port: 0}
  const harnessEnv = (sessionId?: SessionId): NodeJS.ProcessEnv => {
    const baseEnv = opts.childEnv ? opts.childEnv(portRef.port) : process.env
    return sessionId ? {...baseEnv, CONCIV_SESSION_ID: sessionId} : baseEnv
  }
  const tokenScopedBase = (): string | undefined => {
    if (portRef.port === 0) return undefined
    const prefix = opts.accessToken ? `/t/${opts.accessToken}` : ''
    return `http://127.0.0.1:${portRef.port}${prefix}`
  }
  const nativeUrl = (): string | undefined => {
    if (!opts.nativePageDir) return undefined
    return tokenScopedBase()
  }

  const appOpts: MakeAppOpts = {
    cfg,
    cwd: opts.root,
    basePath: opts.accessToken ? `/t/${opts.accessToken}` : '',
    bridge: opts.bridge,
    openInEditor,
    systemPromptFile: systemPrompt ? paths.systemPrompt : undefined,
    systemPromptText: systemPrompt,
    extensions,
    plugins,
    loginToken: opts.accessToken ?? randomUUID(),
    extensionConfig: cfg.extensions,
    harness: opts.harness,
    harnessEnv,
    allowedOrigins: opts.allowedOrigins,
    onShutdown: opts.onShutdown,
    nativePageDir: opts.nativePageDir,
    nativeUrl,
  }
  const {app, dispose, extensionContexts, hub, claimUpgrade} = await makeApp(appOpts)

  const notifyClient = onceNotifier(opts.onClientRequest)
  const served = opts.accessToken
    ? new Hono()
        .use(async (_context, next) => {
          notifyClient()
          await next()
        })
        .all(`${hub.base}*`, (context) => hub.handler(context.req.raw))
        .mount(`/t/${opts.accessToken}`, app.fetch)
    : app
  const listener: Listener = {fetch: served.fetch.bind(served), claimUpgrade}
  let serving: Served
  try {
    serving = await servePort(listener, opts.port, paths.server)
  } catch (error) {
    await dispose()
    throw error
  }
  const {port, close} = serving
  portRef.port = port

  const endpointDir = opts.devEndpointDir ?? defaultDevEndpointDir()
  const base = tokenScopedBase()
  try {
    if (base) {
      const endpoint = claudeConnectEndpointFile({stateDir: paths.dir, mcpUrl: `${base}/api/mcp`})
      writePrivateFile(endpoint.path, endpoint.contents)
    }
    if (opts.nativePageDir && base) {
      writeDevEndpoint(endpointDir, {apiBase: base, token: opts.accessToken ?? null, pid: process.pid})
    }
  } catch (error) {
    await dispose()
    await close()
    throw error
  }
  const clearEndpoint = (): void => {
    if (!opts.nativePageDir) return
    try {
      removeDevEndpoint(endpointDir, process.pid)
    } catch (error) {
      console.error('conciv: failed to remove the dev endpoint file', error)
    }
  }
  return {
    port,
    apiBase: `http://127.0.0.1:${port}`,
    hub,
    cfg,
    extensionContexts,
    stop: async () => {
      clearEndpoint()
      await dispose()
      await close()
    },
  }
}
