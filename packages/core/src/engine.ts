import {writeFileSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {serve} from 'srvx'
import type {HarnessChild} from '@aidx/protocol/harness-types'
import type {BundlerBridge} from '@aidx/protocol/bundler-types'
import {makeApp, type MakeAppOpts} from './app.js'
import {makeEditorOpener} from './editor/open.js'
import {resolveConfig, type AidxConfig, type ResolvedAidxConfig} from './config.js'

export type HtmlTag = {tag: string; attrs: Record<string, string | boolean>; injectTo: 'head'}

// <head> tags the widget needs. pw-api-base points at the standalone core server (cross-origin).
export function htmlTags(corePort: number, opts: {previewId: string; widgetUrl?: string}): HtmlTag[] {
  const tags: HtmlTag[] = [
    {tag: 'meta', attrs: {name: 'pw-api-base', content: `http://127.0.0.1:${corePort}`}, injectTo: 'head'},
    {tag: 'meta', attrs: {name: 'pw-preview-id', content: opts.previewId}, injectTo: 'head'},
  ]
  if (opts.widgetUrl) tags.push({tag: 'script', attrs: {src: opts.widgetUrl, defer: true}, injectTo: 'head'})
  return tags
}

export type StartOpts = {
  options: AidxConfig
  root: string
  bridge?: BundlerBridge
  launchEditor: (file: string, line: number) => void
  childEnv?: (corePort: number) => NodeJS.ProcessEnv
}

export type Engine = {port: number; stop: () => Promise<void>; cfg: ResolvedAidxConfig}

// srvx exposes server.url, not server.port (HARD RULE 6) — parse it.
function portOf(url: string | undefined): number {
  return Number(new URL(url ?? 'http://127.0.0.1:0').port)
}

export async function start(opts: StartOpts): Promise<Engine> {
  const cfg = resolveConfig(opts.options, opts.root)
  const stateDir = join(cfg.stateRoot, '.aidx')
  mkdirSync(stateDir, {recursive: true})
  const systemPromptFile = join(stateDir, 'chat-system-prompt.txt')
  writeFileSync(systemPromptFile, cfg.systemPrompt)

  const openInEditor = makeEditorOpener(
    (file, line) => opts.launchEditor(file, line),
    4000,
    () => Date.now(),
  )

  // stdio:[…'pipe','pipe'] guarantees the pipes; narrow via a guard, never `!`.
  const portRef = {port: 0}
  const spawnHarness = (args: string[], cwd: string): HarnessChild => {
    const harnessBin = cfg.harnessBin ?? 'claude'
    const env = opts.childEnv ? opts.childEnv(portRef.port) : process.env
    const child = spawn(harnessBin, args, {cwd, stdio: ['ignore', 'pipe', 'pipe'], env})
    const {stdout, stderr} = child
    if (!stdout || !stderr) throw new Error(`harness "${harnessBin}" did not expose stdout/stderr pipes`)
    return {pid: child.pid ?? -1, stdout, stderr, kill: () => void child.kill('SIGTERM')}
  }

  const appOpts: MakeAppOpts = {
    cfg,
    cwd: opts.root,
    bridge: opts.bridge,
    openInEditor,
    systemPromptFile,
    spawnHarness,
  }
  const app = makeApp(appOpts)
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
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
