import {serveHono} from '@conciv/serve'
import {Hono} from 'hono'
import getPort from 'get-port'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import type {AnyExtension} from '@conciv/extension'
import {makeApp, type MakeAppOpts} from './app.js'

export type {AppType} from './app.js'
import {makeEditorOpener} from './editor/open.js'
import {resolveConfig, type ConcivConfig, type ResolvedConcivConfig} from './config.js'
import {statePaths} from './lib/state-paths.js'
import {writeText} from './lib/fs.js'
import {defaultDevEndpointDir, removeDevEndpoint, writeDevEndpoint} from './lib/dev-endpoint.js'

export type StartOpts = {
  options: ConcivConfig
  root: string
  bridge?: BundlerBridge
  launchEditor: (file: string, line: number) => void
  childEnv?: (corePort: number) => NodeJS.ProcessEnv
  port?: number

  allowedOrigins?: string[]
  accessToken?: string
  onClientRequest?: () => void
  onShutdown?: () => void

  extensions?: AnyExtension[]
  harness?: HarnessAdapter
  nativePageDir?: string
  devEndpointDir?: string
}

export type Engine = {
  port: number
  stop: () => Promise<void>
  cfg: ResolvedConcivConfig
  extensionContexts: Record<string, unknown>
}

function onceNotifier(callback?: () => void): () => void {
  let fired = false
  return () => {
    if (fired || !callback) return
    fired = true
    callback()
  }
}

export function composeSystemPrompt(base: string | undefined, extensions: readonly AnyExtension[]): string {
  return [base, ...extensions.map((extension) => extension.systemPrompt)].filter(Boolean).join('\n\n')
}

export async function start(opts: StartOpts): Promise<Engine> {
  const cfg = resolveConfig(opts.options, opts.root)
  const paths = statePaths(cfg.stateRoot)

  const systemPrompt = composeSystemPrompt(cfg.systemPrompt, opts.extensions ?? [])
  if (systemPrompt) writeText(paths.systemPrompt, systemPrompt)

  const openInEditor = makeEditorOpener(
    (file, line) => opts.launchEditor(file, line),
    4000,
    () => Date.now(),
  )

  const portRef = {port: 0}
  const harnessEnv = (sessionId?: string): NodeJS.ProcessEnv => {
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
    const base = tokenScopedBase()
    return base ? `${base}/native` : undefined
  }

  const appOpts: MakeAppOpts = {
    cfg,
    cwd: opts.root,
    bridge: opts.bridge,
    openInEditor,
    systemPromptFile: systemPrompt ? paths.systemPrompt : undefined,
    systemPromptText: systemPrompt,
    extensions: opts.extensions,
    extensionConfig: cfg.extensions,
    harness: opts.harness,
    harnessEnv,
    allowedOrigins: opts.allowedOrigins,
    onShutdown: opts.onShutdown,
    nativePageDir: opts.nativePageDir,
    nativeUrl,
  }
  const {app, disposers, extensionContexts, closeDb} = await makeApp(appOpts)

  const requestedPort = opts.port ?? (await getPort())
  const notifyClient = onceNotifier(opts.onClientRequest)
  const served = opts.accessToken
    ? new Hono()
        .use(async (_context, next) => {
          notifyClient()
          await next()
        })
        .mount(`/t/${opts.accessToken}`, app.fetch)
    : app
  const dispose = async (): Promise<void> => {
    await Promise.all(disposers.map((runDispose) => runDispose()))
    closeDb()
  }
  let serving: Awaited<ReturnType<typeof serveHono>>
  try {
    serving = await serveHono({fetch: served.fetch.bind(served), port: requestedPort})
  } catch (error) {
    await dispose()
    throw error
  }
  const {port, close} = serving
  portRef.port = port

  const endpointDir = opts.devEndpointDir ?? defaultDevEndpointDir()
  const base = tokenScopedBase()
  if (opts.nativePageDir && base) {
    writeDevEndpoint(endpointDir, {apiBase: base, token: opts.accessToken ?? null, pid: process.pid})
  }
  return {
    port,
    cfg,
    extensionContexts,
    stop: async () => {
      if (opts.nativePageDir) removeDevEndpoint(endpointDir, process.pid)
      await dispose()
      await close()
    },
  }
}
