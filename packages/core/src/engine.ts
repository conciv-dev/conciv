import {spawn} from 'node:child_process'
import {serve} from 'srvx'
import getPort from 'get-port'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {AnyExtension} from '@conciv/extension'
import {getHarness} from '@conciv/harness'
import {makeApp, type MakeAppOpts} from './app.js'
import {attachWebSocket} from './api/ws.js'
import {originAllowed} from './api/cors.js'
import {makeEditorOpener} from './editor/open.js'
import {resolveConfig, type ConcivConfig, type ResolvedConcivConfig} from './config.js'
import {statePaths} from './state-paths.js'
import {writeText} from './fs.js'

export type StartOpts = {
  options: ConcivConfig
  root: string
  bridge?: BundlerBridge
  launchEditor: (file: string, line: number) => void
  childEnv?: (corePort: number) => NodeJS.ProcessEnv
  port?: number

  allowedOrigins?: string[]

  extensions?: AnyExtension[]
}

export type Engine = {
  port: number
  stop: () => Promise<void>
  cfg: ResolvedConcivConfig
  extensionContexts: Record<string, unknown>
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
    bridge: opts.bridge,
    openInEditor,
    systemPromptFile: systemPrompt ? paths.systemPrompt : undefined,
    systemPromptText: systemPrompt,
    extensions: opts.extensions,
    extensionConfig: cfg.extensions,
    harnessEnv,
    allowedOrigins: opts.allowedOrigins,
  }
  const {app, disposers, extensionContexts} = await makeApp(appOpts)

  const requestedPort = opts.port ?? (await getPort())
  const server = serve({fetch: app.fetch, port: requestedPort, hostname: '127.0.0.1'})
  await server.ready()
  const allowed = new Set(opts.allowedOrigins ?? [])
  attachWebSocket(server, app, (origin) => originAllowed(origin, allowed))
  const port = portOf(server.url)
  portRef.port = port
  return {
    port,
    cfg,
    extensionContexts,
    stop: async () => {
      await Promise.all(disposers.map((dispose) => dispose()))
      await server.close(true)
    },
  }
}

function portOf(url: string | undefined): number {
  return Number(new URL(url ?? 'http://127.0.0.1:0').port)
}
