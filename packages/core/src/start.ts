import {serveHono} from '@conciv/serve'
import {Hono} from 'hono'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {HarnessAdapter, TerminalOpener} from '@conciv/protocol/harness-types'
import type {AnyExtension} from '@conciv/extension'
import {makeApp, type MakeAppOpts} from './app.js'

export type {AppType} from './app.js'
import {makeEditorOpener} from './editor/open.js'
import {spawnTerminalOpener} from './chat/terminal-opener.js'
import {resolveConfig, type ConcivConfig, type ResolvedConcivConfig} from './config.js'
import {statePaths} from './lib/state-paths.js'
import {writeText} from './lib/fs.js'
import {isAddressInUse, readPersistedPort, writePersistedPort} from './lib/server-port.js'

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
  openTerminal?: TerminalOpener
}

export type Engine = {
  port: number
  stop: () => Promise<void>
  cfg: ResolvedConcivConfig
  extensionContexts: Record<string, unknown>
}

type Served = Awaited<ReturnType<typeof serveHono>>
type FetchHandler = (request: Request) => Response | Promise<Response>

const PERSISTED_PORT_ATTEMPTS = 4
const PERSISTED_PORT_RETRY_MS = 300

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function reservePort(fetchHandler: FetchHandler, port: number): Promise<Served | undefined> {
  for (let attempt = 0; attempt < PERSISTED_PORT_ATTEMPTS; attempt++) {
    try {
      return await serveHono({fetch: fetchHandler, port})
    } catch (error) {
      if (!isAddressInUse(error)) throw error
      if (attempt < PERSISTED_PORT_ATTEMPTS - 1) await delay(PERSISTED_PORT_RETRY_MS)
    }
  }
  return undefined
}

async function servePersistedPort(fetchHandler: FetchHandler, stateFile: string): Promise<Served> {
  const persisted = readPersistedPort(stateFile)
  const reused = persisted === undefined ? undefined : await reservePort(fetchHandler, persisted)
  if (reused) return reused
  const serving = await serveHono({fetch: fetchHandler, port: 0})
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

export async function start(opts: StartOpts): Promise<Engine> {
  const cfg = resolveConfig(opts.options, opts.root)
  const paths = statePaths(cfg.stateRoot)

  const systemPrompt = [
    cfg.systemPrompt,
    ...(opts.extensions ?? []).flatMap((ext) => [
      ...(ext.tools ?? []).map((tool) => tool.promptSnippet),
      ext.systemPrompt,
    ]),
  ]
    .filter(Boolean)
    .join('\n\n')
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

  const appOpts: MakeAppOpts = {
    cfg,
    cwd: opts.root,
    basePath: opts.accessToken ? `/t/${opts.accessToken}` : '',
    bridge: opts.bridge,
    openInEditor,
    openTerminal: opts.openTerminal ?? spawnTerminalOpener,
    systemPromptFile: systemPrompt ? paths.systemPrompt : undefined,
    systemPromptText: systemPrompt,
    extensions: opts.extensions,
    extensionConfig: cfg.extensions,
    harness: opts.harness,
    harnessEnv,
    allowedOrigins: opts.allowedOrigins,
    onShutdown: opts.onShutdown,
  }
  const {app, disposers, extensionContexts, closeDb} = await makeApp(appOpts)

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
  const fetchHandler: FetchHandler = served.fetch.bind(served)
  let serving: Served
  try {
    serving =
      opts.port === undefined
        ? await servePersistedPort(fetchHandler, paths.server)
        : await serveHono({fetch: fetchHandler, port: opts.port})
  } catch (error) {
    await dispose()
    throw error
  }
  const {port, close} = serving
  portRef.port = port
  return {
    port,
    cfg,
    extensionContexts,
    stop: async () => {
      await dispose()
      await close()
    },
  }
}
