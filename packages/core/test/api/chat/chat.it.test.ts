import {describe, it, expect, afterEach} from 'vitest'
import {z} from 'zod'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {spawn} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {registerChatRoutes} from '../../../src/api/chat/chat.js'
import {claude} from '@aidx/harness/claude'
import {acquireLock} from '../../../src/store/lock.js'
import {makeUiBus} from '../../../src/runtime/ui-bus.js'

// Real process-boundary IT: the chat routes spawn a real child (fake-claude), pipe its stdout
// through the real decoder + TanStack SSE encoder, over a real srvx server. Proves the
// spawn → AG-UI SSE → --resume path on the h3 app.

const fakeClaude = fileURLToPath(new URL('../../fixtures/fake-claude.ts', import.meta.url))
const dirs: string[] = []

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'aidx-chat-it-'))
  dirs.push(d)
  return d
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)})
}

async function startServer(over: {argvFile?: string; stateRoot?: string} = {}): Promise<{server: Server; base: string}> {
  const stateRoot = over.stateRoot ?? tmp()
  const app = new H3()
  registerChatRoutes(app, {
    cwd: stateRoot,
    stateRoot,
    previewId: 'it-preview',
    initialSessionId: '',
    harness: claude,
    spawnHarness: (args, cwd) => {
      const child = spawn(process.execPath, [fakeClaude, ...args], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {...process.env, ...(over.argvFile ? {AIDX_TEST_ARGV_FILE: over.argvFile} : {})},
      })
      const {stdout, stderr} = child
      if (!stdout || !stderr) throw new Error('fake-claude did not expose stdout/stderr')
      return {pid: child.pid ?? -1, stdout, stderr, kill: () => child.kill('SIGTERM')}
    },
    systemPromptText: '',
    uiBus: makeUiBus(),
  })
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  return {server, base: new URL(server.url ?? '').origin}
}

const turn = (text: string) => ({messages: [{id: 'm', role: 'user', parts: [{type: 'text', content: text}]}]})

describe('chat routes (IT, real spawn over h3)', () => {
  const state = {server: undefined as Server | undefined}
  afterEach(async () => {
    if (state.server) await state.server.close()
    state.server = undefined
    for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
  })

  it('streams TanStack AG-UI SSE from a real claude child', async () => {
    const {server, base} = await startServer()
    state.server = server
    const res = await postJson(`${base}/api/chat`, turn('hi'))
    const body = await res.text()
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(body).toContain('RUN_STARTED')
    expect(body).toContain('hello from fake')
    expect(body).toContain('RUN_FINISHED')
  })

  it('streams exactly one run lifecycle pair through chat()', async () => {
    const {server, base} = await startServer()
    state.server = server
    const body = await (await postJson(`${base}/api/chat`, turn('hi'))).text()
    const count = (needle: string) => body.split(needle).length - 1
    expect(count('RUN_STARTED')).toBe(1)
    expect(count('RUN_FINISHED')).toBe(1)
  })

  it('passes --resume <captured session id> on the second turn', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const {server, base} = await startServer({argvFile})
    state.server = server
    await (await postJson(`${base}/api/chat`, turn('hi'))).text()
    await (await postJson(`${base}/api/chat`, turn('more'))).text()
    const argv = z.array(z.string()).parse(JSON.parse(readFileSync(argvFile, 'utf8')))
    expect(argv).toContain('--resume')
    expect(argv[argv.indexOf('--resume') + 1]).toBe('sess-fake')
  })

  it('POST /api/chat/ui 400s on a malformed spec, reports injected:false with no active turn', async () => {
    const {server, base} = await startServer()
    state.server = server
    const bad = await postJson(`${base}/api/chat/ui`, {spec: {kind: 'choices'}})
    expect(bad.status).toBe(400)
    const ok = await postJson(`${base}/api/chat/ui`, {kind: 'confirm', renderId: 'r9', question: 'OK?'})
    expect(await ok.json()).toEqual({renderId: 'r9', injected: false})
  })

  it('PreToolUse gate allows non-Bash + safe Bash, denies risky Bash with no widget to ask', async () => {
    const {server, base} = await startServer()
    state.server = server
    const DecisionSchema = z.object({hookSpecificOutput: z.object({permissionDecision: z.string()})})
    const decisionFor = async (body: unknown): Promise<string> => {
      const res = await postJson(`${base}/api/chat/permission`, body)
      const json = DecisionSchema.parse(await res.json())
      return json.hookSpecificOutput.permissionDecision
    }
    expect(await decisionFor({tool_name: 'Edit', tool_input: {file_path: 'a.ts'}})).toBe('allow')
    expect(await decisionFor({tool_name: 'Bash', tool_input: {command: 'ls -la'}})).toBe('allow')
    expect(await decisionFor({tool_name: 'Bash', tool_input: {command: 'rm -rf dist'}})).toBe('deny')
  })

  it('refuses with 409 while the lock is held by iterate', async () => {
    const stateRoot = tmp()
    const {server, base} = await startServer({stateRoot})
    state.server = server
    acquireLock(stateRoot, 'iterate', process.pid)
    const res = await postJson(`${base}/api/chat`, {messages: []})
    expect(res.status).toBe(409)
  })
})
