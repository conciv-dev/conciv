import {describe, it, expect, afterEach} from 'vitest'
import {z} from 'zod'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {EventType} from '@tanstack/ai'
import {createTestkit, until, type Kit} from '@conciv/harness-testkit'
import {acquireLock, readLock} from '../../../src/store/lock.js'
import {ChatSessionSchema} from '@conciv/protocol/chat-types'
import {bootCoreApp} from '../../helpers/boot.js'
import {countType, runTurn} from '../../helpers/turns.js'
import {requireClaude} from '../../helpers/adapters.js'

const claude = requireClaude()

const dirs: string[] = []

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'conciv-chat-it-'))
  dirs.push(d)
  return d
}

function fakeEnv(
  opts: {
    argvFile?: string
    rich?: boolean
    partial?: boolean
    hang?: boolean
    usageBySession?: Record<string, number>
  } = {},
): (sessionId?: string) => NodeJS.ProcessEnv {
  return (sessionId) => {
    const inputTokens = opts.usageBySession?.[sessionId ?? '']
    return {
      ...(opts.argvFile ? {CONCIV_TEST_ARGV_FILE: opts.argvFile} : {}),
      ...(opts.rich ? {CONCIV_FAKE_RICH: '1'} : {}),
      ...(opts.partial ? {CONCIV_FAKE_PARTIAL: '1'} : {}),
      ...(opts.hang ? {CONCIV_FAKE_HANG: '1'} : {}),
      ...(inputTokens != null ? {CONCIV_FAKE_INPUT_TOKENS: String(inputTokens)} : {}),
    }
  }
}

describe('chat routes (IT, real makeApp + fake-claude spawn)', () => {
  const state = {kit: undefined as Kit | undefined}
  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
  })

  async function setup(fakeOpts: Parameters<typeof fakeEnv>[0] = {}): Promise<Kit> {
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: fakeEnv(fakeOpts)}})).setup()
    state.kit = kit
    return kit
  }

  it('streams TanStack AG-UI SSE from a real claude child', async () => {
    const kit = await setup()
    const events = await runTurn(kit, 'hi', await kit.session())
    expect(countType(events, EventType.RUN_STARTED)).toBe(1)
    expect(events.text()).toContain('hello from fake')
    expect(events.runs()).toBe(1)
  })

  it('renders text AND extracts usage under --include-partial-messages (real claude stream shape)', async () => {
    const kit = await setup({partial: true})
    const events = await runTurn(kit, 'hi', await kit.session())
    expect(countType(events, EventType.RUN_STARTED)).toBe(1)
    expect(events.text()).toContain('hello from fake')
    expect(events.runs()).toBe(1)
    expect(events.custom('conciv-usage').length).toBeGreaterThan(0)
  })

  it('persists turn-end usage so GET /api/chat/session returns it for the next open', async () => {
    const kit = await setup()
    const id = await kit.session()
    await runTurn(kit, 'hi', id)
    const session = (await (await kit.get('/api/chat/session', id)).json()) as {
      usage?: {contextWindow?: number; inputTokens?: number; cacheReadTokens?: number}
    }
    expect(session.usage?.contextWindow).toBe(200000)
    expect(session.usage?.inputTokens).toBe(100)
    expect(session.usage?.cacheReadTokens).toBe(40)
  })

  it('streams exactly one run lifecycle pair through chat()', async () => {
    const kit = await setup()
    const events = await runTurn(kit, 'hi', await kit.session())
    expect(countType(events, EventType.RUN_STARTED)).toBe(1)
    expect(countType(events, EventType.RUN_FINISHED)).toBe(1)
  })

  it('streams a multi-block turn (empty thinking + text + tool call + text) without dropping text', async () => {
    const kit = await setup({rich: true})
    const events = await runTurn(kit, 'hi', await kit.session())
    expect(countType(events, EventType.RUN_STARTED)).toBe(1)
    expect(countType(events, EventType.RUN_FINISHED)).toBe(1)
    expect(events.text()).toContain('Proving it.')
    expect(events.text()).toContain('RICH_REPLY_VISIBLE')
  })

  it('passes --resume <captured session id> on the second turn', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const kit = await setup({argvFile})
    const id = await kit.session()
    await runTurn(kit, 'hi', id)
    await runTurn(kit, 'more', id)
    const argv = z.array(z.string()).parse(JSON.parse(readFileSync(argvFile, 'utf8')))
    expect(argv).toContain('--resume')
    expect(argv[argv.indexOf('--resume') + 1]).toBe('sess-fake')
  })

  it('passes --model <selected> to the spawned claude when the widget sends it via forwardedProps', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const kit = await setup({argvFile})
    const id = await kit.session()
    const stream = await kit.attach(id)
    await kit.post(
      '/api/chat',
      {messages: [{id: 'm', role: 'user', parts: [{type: 'text', content: 'hi'}]}], forwardedProps: {model: 'haiku'}},
      id,
    )
    await stream.done()
    const argv = z.array(z.string()).parse(JSON.parse(readFileSync(argvFile, 'utf8')))
    expect(argv).toContain('--model')
    expect(argv[argv.indexOf('--model') + 1]).toBe('haiku')
  })

  it('passes the harness default model when no model is selected', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const kit = await setup({argvFile})
    await runTurn(kit, 'hi', await kit.session())
    const argv = z.array(z.string()).parse(JSON.parse(readFileSync(argvFile, 'utf8')))
    expect(argv[argv.indexOf('--model') + 1]).toBe('sonnet')
  })

  it('POST /api/chat/ui 400s on a malformed spec, reports injected:false with no active turn', async () => {
    const kit = await setup()
    const bad = await kit.post('/api/chat/ui', {spec: {kind: 'choices'}})
    expect(bad.status).toBe(400)
    const ok = await kit.post('/api/chat/ui', {kind: 'confirm', renderId: 'r9', question: 'OK?'})
    expect(await ok.json()).toEqual({renderId: 'r9', injected: false})
  })

  it('refuses with 409 while a session lock is held by iterate', async () => {
    const kit = await setup()
    const id = await kit.session()
    acquireLock(kit.stateRoot, id, 'iterate', process.pid)
    const res = await kit.post('/api/chat', {messages: []}, id)
    expect(res.status).toBe(409)
  })

  it('rejects a turn with no resolved session (400)', async () => {
    const kit = await setup()
    const res = await kit.post('/api/chat', {
      messages: [{id: 'm', role: 'user', parts: [{type: 'text', content: 'hi'}]}],
    })
    expect(res.status).toBe(400)
  })

  it('keeps per-session resume independent under distinct ids', async () => {
    const kit = await setup()
    const a = await kit.session()
    const b = await kit.session()
    await runTurn(kit, 'hi', a)

    const beforeB = ChatSessionSchema.parse(await (await kit.get('/api/chat/session', b)).json())
    expect(beforeB.harnessSessionId).toBeNull()
    expect(beforeB.origin).toBe('chat')

    const afterA = ChatSessionSchema.parse(await (await kit.get('/api/chat/session', a)).json())
    expect(afterA.harnessSessionId).toBe('sess-fake')
    expect(afterA.origin).toBe('chat')
  })

  it('does NOT 409 a second session while a different one would be busy', async () => {
    const kit = await setup()
    const a = await kit.session()
    const b = await kit.session()
    acquireLock(kit.stateRoot, a, 'chat', process.pid)
    const res = await kit.post('/api/chat', {messages: []}, b)
    expect(res.status).toBe(200)
  })

  it('persists usage onto each session record, not a shared pointer', async () => {
    const usageBySession: Record<string, number> = {}
    const kit = await setup({usageBySession})
    const a = await kit.session()
    const b = await kit.session()
    usageBySession[a] = 111
    usageBySession[b] = 222
    await runTurn(kit, 'hi', a)
    await runTurn(kit, 'yo', b)
    const ua = ChatSessionSchema.parse(await (await kit.get('/api/chat/session', a)).json()).usage
    const ub = ChatSessionSchema.parse(await (await kit.get('/api/chat/session', b)).json()).usage
    expect(ua?.inputTokens).toBe(111)
    expect(ub?.inputTokens).toBe(222)
    expect(ua?.inputTokens).not.toBe(ub?.inputTokens)
  })

  it('routes POST /api/chat/ui to the live turn by our id (cross-process path)', {timeout: 15000}, async () => {
    const kit = await setup({hang: true})
    const a = await kit.session()
    const b = await kit.session()

    await kit.post('/api/chat', {messages: [{id: 'm', role: 'user', parts: [{type: 'text', content: 'hi'}]}]}, a)
    await until(() => readLock(kit.stateRoot, a).held, {hangGuardMs: 5000})

    await until(
      async () => {
        const res = await kit.post('/api/chat/ui', {kind: 'confirm', renderId: 'r-a', question: 'ok?'}, a)
        return ((await res.json()) as {injected: boolean}).injected
      },
      {hangGuardMs: 5000},
    )

    const bRes = await kit.post('/api/chat/ui', {kind: 'confirm', renderId: 'r-b', question: 'ok?'}, b)
    expect(((await bRes.json()) as {injected: boolean}).injected).toBe(false)

    await kit.post('/api/chat/stop', {}, a)
    await until(() => !readLock(kit.stateRoot, a).held, {hangGuardMs: 5000})
  })
})
