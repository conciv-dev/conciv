import {describe, it, expect, afterEach} from 'vitest'
import {createServer, type Server} from 'node:http'
import {spawn} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {makeChatRoute} from '../src/chat-route.js'
import {acquireLock} from '../src/claude-lock.js'

// Real process-boundary IT: makeChatRoute spawns a real child (the fake-claude executable),
// pipes its stdout through the REAL transcoder + TanStack SSE encoder, over a real HTTP
// server. Proves the spawn → AG-UI SSE → --resume path, not a bypass.

const fakeClaude = fileURLToPath(new URL('fixtures/fake-claude.ts', import.meta.url))
const dirs: string[] = []

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'devgent-chat-it-'))
  dirs.push(d)
  return d
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)})
}

function startServer(over: {argvFile?: string; lockDir?: string} = {}): Promise<{server: Server; base: string}> {
  const lockDir = over.lockDir ?? tmp()
  const route = makeChatRoute({
    cwd: lockDir,
    lockDir,
    previewId: 'it-preview',
    initialSessionId: '',
    spawnClaude: (args, cwd) => {
      const child = spawn(process.execPath, [fakeClaude, ...args], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {...process.env, ...(over.argvFile ? {DEVGENT_TEST_ARGV_FILE: over.argvFile} : {})},
      })
      return {pid: child.pid ?? -1, stdout: child.stdout!, stderr: child.stderr!, kill: () => child.kill('SIGTERM')}
    },
  })
  const server = createServer((req, res) => {
    void route(req, res, () => {
      res.statusCode = 404
      res.end('next')
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({server, base: `http://127.0.0.1:${port}`})
    })
  })
}

const turn = (text: string) => ({messages: [{id: 'm', role: 'user', parts: [{type: 'text', content: text}]}]})

describe('chat-route (IT, real spawn)', () => {
  const state = {server: undefined as Server | undefined}
  afterEach(async () => {
    await new Promise<void>((r) => (state.server ? state.server.close(() => r()) : r()))
    state.server = undefined
    for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
  })

  it('streams TanStack AG-UI SSE from a real claude child', async () => {
    const {server, base} = await startServer()
    state.server = server
    const res = await postJson(`${base}/__pw/chat`, turn('hi'))
    const body = await res.text()
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(body).toContain('RUN_STARTED')
    expect(body).toContain('hello from fake')
    expect(body).toContain('RUN_FINISHED')
  })

  it('passes --resume <captured session id> on the second turn', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const {server, base} = await startServer({argvFile})
    state.server = server
    await (await postJson(`${base}/__pw/chat`, turn('hi'))).text()
    await (await postJson(`${base}/__pw/chat`, turn('more'))).text()
    const argv = JSON.parse(readFileSync(argvFile, 'utf8')) as string[]
    expect(argv).toContain('--resume')
    expect(argv[argv.indexOf('--resume') + 1]).toBe('sess-fake')
  })

  it('POST /__pw/chat/ui 400s on a malformed spec, reports injected:false with no active turn', async () => {
    const {server, base} = await startServer()
    state.server = server
    const bad = await postJson(`${base}/__pw/chat/ui`, {spec: {kind: 'choices'}})
    expect(bad.status).toBe(400)
    const ok = await postJson(`${base}/__pw/chat/ui`, {spec: {kind: 'confirm', renderId: 'r9', question: 'OK?'}})
    expect(await ok.json()).toEqual({renderId: 'r9', injected: false})
  })

  it('PreToolUse gate allows non-Bash + safe Bash, denies risky Bash with no widget to ask', async () => {
    const {server, base} = await startServer()
    state.server = server
    const decisionFor = async (body: unknown): Promise<string> => {
      const res = await postJson(`${base}/__pw/chat/permission`, body)
      const json = (await res.json()) as {hookSpecificOutput: {permissionDecision: string}}
      return json.hookSpecificOutput.permissionDecision
    }
    expect(await decisionFor({tool_name: 'Edit', tool_input: {file_path: 'a.ts'}})).toBe('allow')
    expect(await decisionFor({tool_name: 'Bash', tool_input: {command: 'ls -la'}})).toBe('allow')
    expect(await decisionFor({tool_name: 'Bash', tool_input: {command: 'rm -rf dist'}})).toBe('deny')
  })

  it('refuses with 409 while the lock is held by iterate', async () => {
    const lockDir = tmp()
    const {server, base} = await startServer({lockDir})
    state.server = server
    acquireLock(lockDir, 'iterate', process.pid)
    const res = await postJson(`${base}/__pw/chat`, {messages: []})
    expect(res.status).toBe(409)
  })
})
