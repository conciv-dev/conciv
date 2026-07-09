import {serveHono} from '@conciv/serve'
import getPort from 'get-port'
import {startStatePlane} from '@conciv/db/server'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import type {AnyExtension} from '@conciv/extension'
import {makeApp, type MakeAppOpts} from './app.js'

export type {AppType} from './app.js'
import {makeEditorOpener} from './editor/open.js'
import {resolveConfig, type ConcivConfig, type ResolvedConcivConfig} from './config.js'
import {statePaths} from './state-paths.js'
import {markerWriter} from './store/markers.js'
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
  statePort: number
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

  const plane = await startStatePlane({dataDir: paths.trailDir, port: await getPort()})
  try {
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
      store: plane.store,
      markers: markerWriter(plane.records),
    }
    const {app, disposers, extensionContexts} = await makeApp(appOpts)

    const requestedPort = opts.port ?? (await getPort())
    const {port, close} = await serveHono({fetch: app.fetch, port: requestedPort})
    portRef.port = port
    return {
      port,
      statePort: plane.port,
      cfg,
      extensionContexts,
      stop: async () => {
        await Promise.all(disposers.map((dispose) => dispose()))
        await close()
        await plane.stop()
      },
    }
  } catch (error) {
    await plane.stop()
    throw error
  }
}
