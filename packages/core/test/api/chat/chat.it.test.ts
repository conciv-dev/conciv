import {describe, it, expect, afterEach} from 'vitest'
import {z} from 'zod'
import {spawn} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {acquireLock, readLock} from '../../../src/store/lock.js'
import {ChatSessionSchema} from '@mandarax/protocol/chat-types'
import {startTestServer, type SpawnHarness, type TestServer} from '../../helpers/server.js'
import {useFakeHarness, hasClaude} from '../../helpers/harness-mode.js'

const fakeIt = it.runIf(useFakeHarness)

// Real process-boundary IT: the REAL app (makeApp) over a real srvx server, with a FAKE harness
// spawn injected (fake-claude.ts emits canned stream-json the real claude decoder parses). Proves
// the production spawn → AG-UI SSE → --resume path without a parallel app wiring.

const fakeClaude = fileURLToPath(new URL('../../fixtures/fake-claude.ts', import.meta.url))
const dirs: string[] = []

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'mandarax-chat-it-'))
  dirs.push(d)
  return d
}

// A fake-claude spawn (optionally capturing argv to a file for the --resume assertion, or emitting
// the rich multi-block transcript via MANDARAX_FAKE_RICH).
function fakeSpawn(
  opts: {
    argvFile?: string
    rich?: boolean
    partial?: boolean
    hang?: boolean
    usageBySession?: Record<string, number>
  } = {},
): SpawnHarness {
  return (args, cwd, sessionId) => {
    const inputTokens = opts.usageBySession?.[sessionId ?? '']
    const child = spawn(process.execPath, [fakeClaude, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(opts.argvFile ? {MANDARAX_TEST_ARGV_FILE: opts.argvFile} : {}),
        ...(opts.rich ? {MANDARAX_FAKE_RICH: '1'} : {}),
        ...(opts.partial ? {MANDARAX_FAKE_PARTIAL: '1'} : {}),
        ...(opts.hang ? {MANDARAX_FAKE_HANG: '1'} : {}),
        ...(inputTokens != null ? {MANDARAX_FAKE_INPUT_TOKENS: String(inputTokens)} : {}),
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

  fakeIt('streams TanStack AG-UI SSE from a real claude child', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn()})
    state.server = server
    const body = await server.postChat(turn('hi'), await server.resolve())
    expect(body).toContain('RUN_STARTED')
    expect(body).toContain('hello from fake')
    expect(body).toContain('RUN_FINISHED')
  })

  it.skipIf(!useFakeHarness && !hasClaude())(
    'streams a run lifecycle with assistant text',
    async () => {
      const server = await startTestServer({spawnHarness: fakeSpawn()})
      state.server = server
      const body = await server.postChat(turn('Reply with a short greeting.'), await server.resolve())
      expect(body).toContain('RUN_STARTED')
      expect(body).toContain('TEXT_MESSAGE_CONTENT')
      expect(body).toContain('RUN_FINISHED')
    },
    60_000,
  )

  fakeIt('renders text AND extracts usage under --include-partial-messages (real claude stream shape)', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn({partial: true})})
    state.server = server
    const body = await server.postChat(turn('hi'), await server.resolve())
    expect(body).toContain('RUN_STARTED')
    expect(body).toContain('hello from fake') // consolidated assistant text must still render
    expect(body).toContain('RUN_FINISHED')
    expect(body).toContain('mandarax-usage') // live usage injected mid-stream
  })

  fakeIt('persists turn-end usage so GET /api/chat/session returns it for the next open', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn()})
    state.server = server
    const id = await server.resolve()
    await server.postChat(turn('hi'), id)
    const session = (await (await server.getSession(id)).json()) as {
      usage?: {contextWindow?: number; inputTokens?: number; cacheReadTokens?: number}
    }
    expect(session.usage?.contextWindow).toBe(200000)
    expect(session.usage?.inputTokens).toBe(100)
    expect(session.usage?.cacheReadTokens).toBe(40)
  })

  fakeIt('streams exactly one run lifecycle pair through chat()', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn()})
    state.server = server
    const body = await server.postChat(turn('hi'), await server.resolve())
    const count = (needle: string) => body.split(needle).length - 1
    expect(count('RUN_STARTED')).toBe(1)
    expect(count('RUN_FINISHED')).toBe(1)
  })

  fakeIt('streams a multi-block turn (empty thinking + text + tool call + text) without dropping text', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn({rich: true})})
    state.server = server
    const body = await server.postChat(turn('hi'), await server.resolve())
    expect(body.split('RUN_STARTED').length - 1).toBe(1)
    expect(body.split('RUN_FINISHED').length - 1).toBe(1)
    expect(body).toContain('Proving it.')
    expect(body).toContain('RICH_REPLY_VISIBLE')
  })

  fakeIt('passes --resume <captured session id> on the second turn', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const server = await startTestServer({spawnHarness: fakeSpawn({argvFile})})
    state.server = server
    const id = await server.resolve()
    await server.postChat(turn('hi'), id)
    await server.postChat(turn('more'), id)
    const argv = z.array(z.string()).parse(JSON.parse(readFileSync(argvFile, 'utf8')))
    expect(argv).toContain('--resume')
    expect(argv[argv.indexOf('--resume') + 1]).toBe('sess-fake')
  })

  fakeIt('passes --model <selected> to the spawned claude when the widget sends it via forwardedProps', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const server = await startTestServer({spawnHarness: fakeSpawn({argvFile})})
    state.server = server
    // The widget puts the model on the AG-UI envelope (forwardedProps), not top-level — this is the
    // authoritative check that a selector switch reaches the real CLI (the agent can't self-report it).
    await (
      await server.post('/api/chat', {messages: [turn('hi')], forwardedProps: {model: 'haiku'}}, await server.resolve())
    ).text()
    const argv = z.array(z.string()).parse(JSON.parse(readFileSync(argvFile, 'utf8')))
    expect(argv).toContain('--model')
    expect(argv[argv.indexOf('--model') + 1]).toBe('haiku')
  })

  fakeIt('omits --model when no model is selected (CLI keeps its own default)', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const server = await startTestServer({spawnHarness: fakeSpawn({argvFile})})
    state.server = server
    await server.postChat(turn('hi'), await server.resolve())
    const argv = z.array(z.string()).parse(JSON.parse(readFileSync(argvFile, 'utf8')))
    expect(argv).not.toContain('--model')
  })

  it('POST /api/chat/ui 400s on a malformed spec, reports injected:false with no active turn', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn()})
    state.server = server
    const bad = await server.post('/api/chat/ui', {spec: {kind: 'choices'}})
    expect(bad.status).toBe(400)
    const ok = await server.post('/api/chat/ui', {kind: 'confirm', renderId: 'r9', question: 'OK?'})
    expect(await ok.json()).toEqual({renderId: 'r9', injected: false})
  })

  fakeIt('PreToolUse gate allows non-Bash + safe Bash, denies risky Bash with no widget to ask', async () => {
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

  it('refuses with 409 while a session lock is held by iterate', async () => {
    const stateRoot = tmp()
    const server = await startTestServer({stateRoot, spawnHarness: fakeSpawn()})
    state.server = server
    const id = await server.resolve()
    acquireLock(stateRoot, id, 'iterate', process.pid)
    const res = await server.post('/api/chat', {messages: []}, id)
    expect(res.status).toBe(409)
  })

  it('rejects a turn with no resolved session (400)', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn()})
    state.server = server
    const res = await server.post('/api/chat', {messages: [turn('hi')]})
    expect(res.status).toBe(400)
  })

  fakeIt('keeps per-session resume independent under distinct ids', async () => {
    const server = await startTestServer({spawnHarness: fakeSpawn()})
    state.server = server
    const a = await server.resolve()
    const b = await server.resolve()
    await server.postChat(turn('hi'), a)
    // b is a fresh session: its /session reports a null harness token before any turn.
    const beforeB = ChatSessionSchema.parse(await (await server.getSession(b)).json())
    expect(beforeB.harnessSessionId).toBeNull()
    expect(beforeB.origin).toBe('chat')
    // a already ran a turn → it has the fake harness token.
    const afterA = ChatSessionSchema.parse(await (await server.getSession(a)).json())
    expect(afterA.harnessSessionId).toBe('sess-fake')
    expect(afterA.origin).toBe('chat')
  })

  fakeIt('does NOT 409 a second session while a different one would be busy', async () => {
    const stateRoot = tmp()
    const server = await startTestServer({stateRoot, spawnHarness: fakeSpawn()})
    state.server = server
    const a = await server.resolve()
    const b = await server.resolve()
    acquireLock(stateRoot, a, 'chat', process.pid)
    const res = await server.post('/api/chat', {messages: []}, b)
    expect(res.status).toBe(200)
  })

  fakeIt('persists usage onto each session record, not a shared pointer', async () => {
    const stateRoot = tmp()
    const usageBySession: Record<string, number> = {}
    const server = await startTestServer({stateRoot, spawnHarness: fakeSpawn({usageBySession})})
    state.server = server
    const a = await server.resolve()
    const b = await server.resolve()
    usageBySession[a] = 111
    usageBySession[b] = 222
    await server.postChat(turn('hi'), a) // usage 111
    await server.postChat(turn('yo'), b) // usage 222
    const ua = ChatSessionSchema.parse(await (await server.getSession(a)).json()).usage
    const ub = ChatSessionSchema.parse(await (await server.getSession(b)).json()).usage
    expect(ua?.inputTokens).toBe(111)
    expect(ub?.inputTokens).toBe(222)
    expect(ua?.inputTokens).not.toBe(ub?.inputTokens) // no cross-write
  })

  fakeIt('routes POST /api/chat/ui to the live turn by our id (cross-process path)', async () => {
    const stateRoot = tmp()
    const server = await startTestServer({stateRoot, spawnHarness: fakeSpawn({hang: true})})
    state.server = server
    const a = await server.resolve()
    const b = await server.resolve()
    // Start a turn for a but DON'T await it — the hang fake keeps the child alive, so a's lock
    // stays held and its uiBus channel stays open while we inject.
    const turnPromise = server.postChat(turn('hi'), a).catch(() => '')
    const deadline = Date.now() + 5000
    while (!readLock(stateRoot, a).held && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25))
    // Give the SSE body its first pull so uiBus.run() has registered a's channel.
    let injectedA = false
    while (Date.now() < deadline) {
      const res = await server.post('/api/chat/ui', {kind: 'confirm', renderId: 'r-a', question: 'ok?'}, a)
      injectedA = ((await res.json()) as {injected: boolean}).injected
      if (injectedA) break
      await new Promise((r) => setTimeout(r, 25))
    }
    expect(injectedA).toBe(true)
    // A different session with no live turn rejects the inject.
    const bRes = await server.post('/api/chat/ui', {kind: 'confirm', renderId: 'r-b', question: 'ok?'}, b)
    expect(((await bRes.json()) as {injected: boolean}).injected).toBe(false)
    // Stop the hung turn so the server can close cleanly.
    await server.post('/api/chat/stop', {}, a)
    await turnPromise
  })
})
