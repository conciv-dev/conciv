import {spawn} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {serve, type Server} from 'srvx'
import {getHarness} from '@conciv/harness'
import type {HarnessChild} from '@conciv/protocol/harness-types'
import {makeApp} from '../../src/app.js'
import type {ResolvedConcivConfig} from '../../src/config.js'
import type {AnyExtension} from '@conciv/extension'

export type SpawnHarness = (args: string[], cwd: string, sessionId?: string) => HarnessChild

export type TestServerOpts = {
  harness?: string
  stateRoot?: string

  cwd?: string

  claudeHome?: string

  spawnHarness?: SpawnHarness

  extensions?: AnyExtension[]

  extensionConfig?: Record<string, unknown>
}

export type TestServer = {
  base: string
  stateRoot: string

  resolve: (id?: string) => Promise<string>
  post: (path: string, body: unknown, sessionId?: string) => Promise<Response>
  postChat: (message: unknown, sessionId?: string) => Promise<string>
  attach: (sessionId: string, opts: {until: string; timeoutMs?: number}) => Promise<string>
  getSession: (sessionId?: string) => Promise<Response>
  getSessions: () => Promise<Response>
  close: () => Promise<void>
}

function realSpawn(bin: string): SpawnHarness {
  return (args, cwd) => {
    const child = spawn(bin, args, {cwd, stdio: ['pipe', 'pipe', 'pipe']})
    const {stdin, stdout, stderr} = child
    if (!stdin || !stdout || !stderr) throw new Error(`harness "${bin}" did not expose stdio pipes`)
    return {pid: child.pid ?? -1, stdin, stdout, stderr, kill: () => void child.kill('SIGTERM')}
  }
}

export async function startTestServer(opts: TestServerOpts = {}): Promise<TestServer> {
  const stateRoot = opts.stateRoot ?? mkdtempSync(join(tmpdir(), 'conciv-it-'))
  const harnessId = opts.harness ?? 'claude'
  const harness = getHarness(harnessId)
  if (!harness) throw new Error(`harness '${harnessId}' not registered`)

  const cfg: ResolvedConcivConfig = {
    enabled: true,
    widgetUrl: undefined,
    stateRoot,
    harness: harnessId,
    harnessBin: undefined,
    sessionId: '',
    systemPrompt: '',
    extensions: undefined,
  }
  const spawnHarness = opts.spawnHarness ?? realSpawn(harness.binName)
  const {app, disposers} = await makeApp({
    cfg,
    cwd: opts.cwd ?? stateRoot,
    openInEditor: () => {},
    spawnHarness,
    claudeHome: opts.claudeHome,
    extensions: opts.extensions,
    extensionConfig: opts.extensionConfig,
  })

  const server: Server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  const base = new URL(server.url ?? '').origin

  const post = (path: string, body: unknown, sessionId?: string): Promise<Response> =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: {'content-type': 'application/json', ...(sessionId ? {'conciv-session-id': sessionId} : {})},
      body: JSON.stringify(body),
    })
  const attach = async (sessionId: string, options: {until: string; timeoutMs?: number}): Promise<string> => {
    const controller = new AbortController()
    const response = await fetch(`${base}/api/chat/attach`, {
      headers: {'conciv-session-id': sessionId},
      signal: controller.signal,
    })
    const reader = response.body?.getReader()
    if (!reader) throw new Error('attach returned no body')
    const decoder = new TextDecoder()
    const deadline = Date.now() + (options.timeoutMs ?? 5000)
    let text = ''
    while (Date.now() < deadline) {
      const {value, done} = await reader.read()
      if (done) break
      text += decoder.decode(value, {stream: true})
      if (text.includes(options.until)) break
    }
    controller.abort()
    return text
  }
  const postChat = async (message: unknown, sessionId?: string): Promise<string> => {
    const id = sessionId ?? (await resolve())
    const attached = attach(id, {until: 'RUN_FINISHED'})
    const response = await post('/api/chat', {messages: [message]}, id)
    if (!response.ok) return response.text()
    return attached
  }
  const getSession = (sessionId?: string): Promise<Response> =>
    fetch(`${base}/api/chat/session`, {headers: sessionId ? {'conciv-session-id': sessionId} : {}})
  const getSessions = (): Promise<Response> => fetch(`${base}/api/chat/sessions`)
  const resolve = async (id?: string): Promise<string> => {
    const res = await post('/api/chat/session/resolve', id ? {id} : {})
    return ((await res.json()) as {sessionId: string}).sessionId
  }
  const close = async (): Promise<void> => {
    await Promise.all(disposers.map((dispose) => dispose()))
    await server.close()
    rmSync(stateRoot, {recursive: true, force: true})
  }
  return {base, stateRoot, resolve, post, postChat, attach, getSession, getSessions, close}
}
