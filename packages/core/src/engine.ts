import {spawn} from 'node:child_process'
import {serve} from 'srvx'
import getPort from 'get-port'
import type {HarnessChild} from '@mandarax/protocol/harness-types'
import type {BundlerBridge} from '@mandarax/protocol/bundler-types'
import {makeApp, type MakeAppOpts} from './app.js'
import {makeEditorOpener} from './editor/open.js'
import {resolveConfig, type MandaraxConfig, type ResolvedMandaraxConfig} from './config.js'
import {statePaths} from './state-paths.js'
import {writeText} from './fs.js'

export type StartOpts = {
  options: MandaraxConfig
  root: string
  bridge?: BundlerBridge
  launchEditor: (file: string, line: number) => void
  childEnv?: (corePort: number) => NodeJS.ProcessEnv
  port?: number
  // Browser origins allowed to call the API beyond loopback (e.g. a dev server on a LAN IP).
  allowedOrigins?: string[]
}

export type Engine = {port: number; stop: () => Promise<void>; cfg: ResolvedMandaraxConfig}

export async function start(opts: StartOpts): Promise<Engine> {
  const cfg = resolveConfig(opts.options, opts.root)
  const paths = statePaths(cfg.stateRoot)
  // Empty (systemPrompt:false) → don't write or pass a file, so no prompt is injected at all.
  if (cfg.systemPrompt) writeText(paths.systemPrompt, cfg.systemPrompt)

  const openInEditor = makeEditorOpener(
    (file, line) => opts.launchEditor(file, line),
    4000,
    () => Date.now(),
  )

  // stdio:[…'pipe','pipe'] guarantees the pipes; narrow via a guard, never `!`.
  const portRef = {port: 0}
  const spawnHarness = (args: string[], cwd: string, sessionId?: string): HarnessChild => {
    const harnessBin = cfg.harnessBin ?? 'claude'
    const baseEnv = opts.childEnv ? opts.childEnv(portRef.port) : process.env
    // The turn's header id rides the child env so the agent's mandarax ui / permission hook echo it back.
    const env = sessionId ? {...baseEnv, MANDARAX_SESSION_ID: sessionId} : baseEnv
    const child = spawn(harnessBin, args, {cwd, stdio: ['pipe', 'pipe', 'pipe'], env})
    const {stdin, stdout, stderr} = child
    if (!stdin || !stdout || !stderr) throw new Error(`harness "${harnessBin}" did not expose stdio pipes`)
    return {pid: child.pid ?? -1, stdin, stdout, stderr, kill: () => void child.kill('SIGTERM')}
  }

  const appOpts: MakeAppOpts = {
    cfg,
    cwd: opts.root,
    bridge: opts.bridge,
    openInEditor,
    systemPromptFile: cfg.systemPrompt ? paths.systemPrompt : undefined,
    spawnHarness,
    allowedOrigins: opts.allowedOrigins,
  }
  const app = makeApp(appOpts)
  // Explicit port (e.g. the Next.js integration) is used as-is; otherwise get-port finds a free one.
  const requestedPort = opts.port ?? (await getPort())
  const server = serve({fetch: app.fetch, port: requestedPort, hostname: '127.0.0.1'})
  await server.ready()
  const port = portOf(server.url)
  portRef.port = port
  return {
    port,
    cfg,
    stop: async () => {
      await server.close(true)
    },
  }
}

// srvx exposes server.url, not server.port (HARD RULE 6) — parse it.
function portOf(url: string | undefined): number {
  return Number(new URL(url ?? 'http://127.0.0.1:0').port)
}
