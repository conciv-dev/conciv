import {spawn} from 'node:child_process'
import {serve} from 'srvx'
import getPort from 'get-port'
import type {HarnessChild} from '@mandarax/protocol/harness-types'
import type {BundlerBridge} from '@mandarax/protocol/bundler-types'
import type {ExtensionServerContributions} from '@mandarax/extension'
import {getHarness} from '@mandarax/harness'
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
  // The collected .server() halves of discovered extensions: extra MCP tools + system prompt text.
  extensions?: ExtensionServerContributions
}

export type Engine = {port: number; stop: () => Promise<void>; cfg: ResolvedMandaraxConfig}

export async function start(opts: StartOpts): Promise<Engine> {
  const cfg = resolveConfig(opts.options, opts.root)
  const paths = statePaths(cfg.stateRoot)
  // The effective prompt = the configured base plus each extension's systemPrompt.append() text.
  // Empty (systemPrompt:false and no appends) → don't write or pass a file, so none is injected.
  const systemPrompt = [cfg.systemPrompt, ...(opts.extensions?.systemPrompt ?? [])].filter(Boolean).join('\n\n')
  if (systemPrompt) writeText(paths.systemPrompt, systemPrompt)

  const openInEditor = makeEditorOpener(
    (file, line) => opts.launchEditor(file, line),
    4000,
    () => Date.now(),
  )

  const portRef = {port: 0}
  const harnessEnv = (sessionId?: string): NodeJS.ProcessEnv => {
    const baseEnv = opts.childEnv ? opts.childEnv(portRef.port) : process.env
    return sessionId ? {...baseEnv, MANDARAX_SESSION_ID: sessionId} : baseEnv
  }

  const spawnHarness = (args: string[], cwd: string, sessionId?: string): HarnessChild => {
    const harnessBin = cfg.harnessBin ?? 'claude'
    const child = spawn(harnessBin, args, {cwd, stdio: ['pipe', 'pipe', 'pipe'], env: harnessEnv(sessionId)})
    const {stdin, stdout, stderr} = child
    if (!stdin || !stdout || !stderr) throw new Error(`harness "${harnessBin}" did not expose stdio pipes`)
    return {pid: child.pid ?? -1, stdin, stdout, stderr, kill: () => void child.kill('SIGTERM')}
  }

  const appOpts: MakeAppOpts = {
    cfg,
    cwd: opts.root,
    bridge: opts.bridge,
    openInEditor,
    systemPromptFile: systemPrompt ? paths.systemPrompt : undefined,
    systemPromptText: systemPrompt,
    extensionTools: opts.extensions?.tools ?? [],
    spawnHarness,
    harnessEnv,
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
      await getHarness(cfg.harness)?.shutdown?.()
      await server.close(true)
    },
  }
}

// srvx exposes server.url, not server.port (HARD RULE 6) — parse it.
function portOf(url: string | undefined): number {
  return Number(new URL(url ?? 'http://127.0.0.1:0').port)
}
