import {describe, it, expect, afterEach} from 'vitest'
import {z} from 'zod'
import {spawn} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {acquireLock} from '../../../src/store/lock.js'
import {startTestServer, type SpawnHarness, type TestServer} from '../../helpers/server.js'

// Real process-boundary IT: the REAL app (makeApp) over a real srvx server, with a FAKE harness
// spawn injected (fake-claude.ts emits canned stream-json the real claude decoder parses). Proves
// the production spawn → AG-UI SSE → --resume path without a parallel app wiring.

const fakeClaude = fileURLToPath(new URL('../../fixtures/fake-claude.ts', import.meta.url))
const dirs: string[] = []

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'aidx-chat-it-'))
  dirs.push(d)
  return d
}

// A fake-claude spawn (optionally capturing argv to a file for the --resume assertion, or emitting
// the rich multi-block transcript via AIDX_FAKE_RICH).
function fakeSpawn(opts: {argvFile?: string; rich?: boolean} = {}): SpawnHarness {
  return (args, cwd) => {
    const child = spawn(process.execPath, [fakeClaude, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(opts.argvFile ? {AIDX_TEST_ARGV_FILE: opts.argvFile} : {}),
        ...(opts.rich ? {AIDX_FAKE_RICH: '1'} : {}),
      },
    })
    const {stdin, stdout, stderr} = child
    if (!stdout || !stderr) throw new Error('fake-claude did not expose stdout/stderr')
    return {pid: child.pid ?? -1, stdin: stdin ?? undefined, stdout, stderr, kill: () => child.kill('SIGTERM')}
  }
}

const turn = (text: string) => ({id: 'm', role: 'user', parts: [{type: 'text', content: text}]})

describe('chat routes (IT, real makeApp + fake-claude spawn)', () => {
  const state = {server: undefined as TestServer | undefined}
  afterEach(async () => {
    if (state.server) await state.server.close()
    state.server = undefined
    for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
  })

  it('streams TanStack AG-UI SSE from a real claude child', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn()})
    state.server = server
    const body = await server.postChat(turn('hi'))
    expect(body).toContain('RUN_STARTED')
    expect(body).toContain('hello from fake')
    expect(body).toContain('RUN_FINISHED')
  })

  it('persists turn-end usage so GET /api/chat/session returns it for the next open', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn()})
    state.server = server
    await server.postChat(turn('hi'))
    const session = (await (await fetch(`${server.base}/api/chat/session`)).json()) as {
      usage?: {contextWindow?: number; inputTokens?: number; cacheReadTokens?: number}
    }
    expect(session.usage?.contextWindow).toBe(200000)
    expect(session.usage?.inputTokens).toBe(100)
    expect(session.usage?.cacheReadTokens).toBe(40)
  })

  it('streams exactly one run lifecycle pair through chat()', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn()})
    state.server = server
    const body = await server.postChat(turn('hi'))
    const count = (needle: string) => body.split(needle).length - 1
    expect(count('RUN_STARTED')).toBe(1)
    expect(count('RUN_FINISHED')).toBe(1)
  })

  it('streams a multi-block turn (empty thinking + text + tool call + text) without dropping text', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn({rich: true})})
    state.server = server
    const body = await server.postChat(turn('hi'))
    expect(body.split('RUN_STARTED').length - 1).toBe(1)
    expect(body.split('RUN_FINISHED').length - 1).toBe(1)
    expect(body).toContain('Proving it.')
    expect(body).toContain('RICH_REPLY_VISIBLE')
  })

  it('passes --resume <captured session id> on the second turn', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const server = await startTestServer({spawnHarness: fakeSpawn({argvFile})})
    state.server = server
    await server.postChat(turn('hi'))
    await server.postChat(turn('more'))
    const argv = z.array(z.string()).parse(JSON.parse(readFileSync(argvFile, 'utf8')))
    expect(argv).toContain('--resume')
    expect(argv[argv.indexOf('--resume') + 1]).toBe('sess-fake')
  })

  it('POST /api/chat/ui 400s on a malformed spec, reports injected:false with no active turn', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn()})
    state.server = server
    const bad = await server.post('/api/chat/ui', {spec: {kind: 'choices'}})
    expect(bad.status).toBe(400)
    const ok = await server.post('/api/chat/ui', {kind: 'confirm', renderId: 'r9', question: 'OK?'})
    expect(await ok.json()).toEqual({renderId: 'r9', injected: false})
  })

  it('PreToolUse gate allows non-Bash + safe Bash, denies risky Bash with no widget to ask', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn()})
    state.server = server
    const DecisionSchema = z.object({hookSpecificOutput: z.object({permissionDecision: z.string()})})
    const decisionFor = async (body: unknown): Promise<string> => {
      const res = await server.post('/api/chat/permission', body)
      const json = DecisionSchema.parse(await res.json())
      return json.hookSpecificOutput.permissionDecision
    }
    expect(await decisionFor({tool_name: 'Edit', tool_input: {file_path: 'a.ts'}})).toBe('allow')
    expect(await decisionFor({tool_name: 'Bash', tool_input: {command: 'ls -la'}})).toBe('allow')
    expect(await decisionFor({tool_name: 'Bash', tool_input: {command: 'rm -rf dist'}})).toBe('deny')
  })

  it('refuses with 409 while the lock is held by iterate', async () => {
    const stateRoot = tmp()
    const server = await startTestServer({stateRoot, spawnHarness: fakeSpawn()})
    state.server = server
    acquireLock(stateRoot, 'iterate', process.pid)
    const res = await server.post('/api/chat', {messages: []})
    expect(res.status).toBe(409)
  })
})
