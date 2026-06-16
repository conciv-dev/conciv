import {spawn} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {serve, type Server} from 'srvx'
import {getHarness} from '@aidx/harness'
import type {HarnessChild} from '@aidx/protocol/harness-types'
import {makeApp} from '../../src/app.js'
import type {ResolvedAidxConfig} from '../../src/config.js'

export type SpawnHarness = (args: string[], cwd: string, sessionId?: string) => HarnessChild

export type TestServerOpts = {
  harness?: string
  stateRoot?: string
  // Inject a (real or fake) harness spawn — the one seam makeApp takes from its host. Defaults to a
  // real spawn of the resolved harness binary.
  spawnHarness?: SpawnHarness
}

export type TestServer = {
  base: string
  stateRoot: string
  previewId: string
  post: (path: string, body: unknown, sessionId?: string) => Promise<Response>
  postChat: (message: unknown, sessionId?: string) => Promise<string>
  getSession: (sessionId?: string) => Promise<Response>
  close: () => Promise<void>
}

// Real harness spawn with all three stdio piped (stdin lets the adapter deliver input). Mirrors
// engine.ts's spawn — the only test-injected seam, exactly as production injects it into makeApp.
function realSpawn(bin: string): SpawnHarness {
  return (args, cwd) => {
    const child = spawn(bin, args, {cwd, stdio: ['pipe', 'pipe', 'pipe']})
    const {stdin, stdout, stderr} = child
    if (!stdin || !stdout || !stderr) throw new Error(`harness "${bin}" did not expose stdio pipes`)
    return {pid: child.pid ?? -1, stdin, stdout, stderr, kill: () => void child.kill('SIGTERM')}
  }
}

// Boot the REAL app (makeApp — the same factory production uses) over a real srvx server, with a
// harness spawn injected. No bespoke route wiring: tests exercise the production composition.
export async function startTestServer(opts: TestServerOpts = {}): Promise<TestServer> {
  const stateRoot = opts.stateRoot ?? mkdtempSync(join(tmpdir(), 'aidx-it-'))
  const harnessId = opts.harness ?? 'claude'
  const harness = getHarness(harnessId)
  if (!harness) throw new Error(`harness '${harnessId}' not registered`)

  const cfg: ResolvedAidxConfig = {
    enabled: true,
    widgetUrl: undefined,
    previewId: 'it-preview',
    stateRoot,
    harness: harnessId,
    harnessBin: undefined,
    sessionId: '',
    testRunner: 'vitest',
    systemPrompt: '',
  }
  const spawnHarness = opts.spawnHarness ?? realSpawn(harness.binName)
  const app = makeApp({cfg, cwd: stateRoot, openInEditor: () => {}, spawnHarness})

  const server: Server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  const base = new URL(server.url ?? '').origin

  const post = (path: string, body: unknown, sessionId?: string): Promise<Response> =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(sessionId ? {'aidx-session-id': sessionId} : {})},
      body: JSON.stringify(body),
    })
  const postChat = async (message: unknown, sessionId?: string): Promise<string> =>
    (await post('/api/chat', {messages: [message]}, sessionId)).text()
  const getSession = (sessionId?: string): Promise<Response> =>
    fetch(`${base}/api/chat/session`, {headers: sessionId ? {'aidx-session-id': sessionId} : {}})
  const close = async (): Promise<void> => {
    await server.close()
    rmSync(stateRoot, {recursive: true, force: true})
  }
  return {base, stateRoot, previewId: cfg.previewId, post, postChat, getSession, close}
}
