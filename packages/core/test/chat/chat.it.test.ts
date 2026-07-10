import {describe, it, expect, afterEach} from 'vitest'
import {z} from 'zod'
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {EventType} from '@tanstack/ai'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {acquireLock} from '../../src/store/lock.js'
import {bootCoreApp} from '../helpers/boot.js'
import {countType, runTurn} from '../helpers/turns.js'
import {requireClaude} from '../helpers/adapters.js'

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
    usageBySession?: Record<string, number>
  } = {},
): (sessionId?: string) => NodeJS.ProcessEnv {
  return (sessionId) => {
    const inputTokens = opts.usageBySession?.[sessionId ?? '']
    return {
      ...(opts.argvFile ? {CONCIV_TEST_ARGV_FILE: opts.argvFile} : {}),
      ...(opts.rich ? {CONCIV_FAKE_RICH: '1'} : {}),
      ...(opts.partial ? {CONCIV_FAKE_PARTIAL: '1'} : {}),
      ...(inputTokens != null ? {CONCIV_FAKE_INPUT_TOKENS: String(inputTokens)} : {}),
    }
  }
}

describe('chat over rpc (IT, real makeApp + fake-claude spawn)', () => {
  const state = {kit: undefined as Kit | undefined}
  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
  })

  async function setup(fakeOpts: Parameters<typeof fakeEnv>[0] = {}, claudeHome?: string): Promise<Kit> {
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: fakeEnv(fakeOpts)}, claudeHome})).setup()
    state.kit = kit
    return kit
  }

  async function metaFor(kit: Kit, id: string) {
    const metas = await kit.rpc.sessions.list(undefined)
    return metas.find((meta) => meta.id === id)
  }

  it('streams TanStack AG-UI chunks from a real claude child', async () => {
    const kit = await setup()
    const events = await runTurn(kit, 'hi', await kit.session())
    expect(countType(events, EventType.RUN_STARTED)).toBe(1)
    expect(events.text()).toContain('hello from fake')
    expect(events.runs()).toBe(1)
  })

  it('renders text AND extracts usage under --include-partial-messages (real claude stream shape)', async () => {
    const kit = await setup({partial: true})
    const id = await kit.session()
    const events = await runTurn(kit, 'hi', id)
    expect(countType(events, EventType.RUN_STARTED)).toBe(1)
    expect(events.text()).toContain('hello from fake')
    expect(events.runs()).toBe(1)
    expect((await metaFor(kit, id))?.usage?.inputTokens).toBeGreaterThan(0)
  })

  it('persists turn-end usage onto the session meta for the next open', async () => {
    const kit = await setup()
    const id = await kit.session()
    await runTurn(kit, 'hi', id)
    const meta = await metaFor(kit, id)
    expect(meta?.usage?.contextWindow).toBe(200000)
    expect(meta?.usage?.inputTokens).toBe(100)
    expect(meta?.usage?.cacheReadTokens).toBe(40)
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

  it('passes --resume <captured session id> on the second turn once its transcript exists', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const claudeHome = tmp()
    const kit = await setup({argvFile}, claudeHome)
    const id = await kit.session()
    await runTurn(kit, 'hi', id)
    const transcript = claude.history?.transcriptPath(kit.stateRoot, 'sess-fake', claudeHome)
    if (!transcript) throw new Error('claude harness lacks history')
    mkdirSync(dirname(transcript), {recursive: true})
    writeFileSync(transcript, '')
    await runTurn(kit, 'more', id)
    const argv = z.array(z.string()).parse(JSON.parse(readFileSync(argvFile, 'utf8')))
    expect(argv).toContain('--resume')
    expect(argv[argv.indexOf('--resume') + 1]).toBe('sess-fake')
  })

  it('drops a stale resume token whose transcript is missing (terminal pre-mints ids before claude writes one)', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const kit = await setup({argvFile}, tmp())
    const id = await kit.session()
    await runTurn(kit, 'hi', id)
    await runTurn(kit, 'more', id)
    const argv = z.array(z.string()).parse(JSON.parse(readFileSync(argvFile, 'utf8')))
    expect(argv).not.toContain('--resume')
  })

  it('passes --model <selected> to the spawned claude once sessions.setModel persists it', async () => {
    const argvFile = join(tmp(), 'argv.json')
    const kit = await setup({argvFile})
    const {sessionId: id} = await kit.rpc.sessions.create(undefined)
    const stream = await kit.attach(id)
    await kit.rpc.sessions.setModel({sessionId: id, model: 'haiku'})
    await kit.rpc.chat.send({sessionId: id, text: 'hi'})
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

  it('reports BUSY while a session lock is held by iterate', async () => {
    const kit = await setup()
    const id = await kit.session()
    acquireLock(kit.stateRoot, id, 'iterate', process.pid)
    await expect(kit.rpc.chat.send({sessionId: id, text: 'hi'})).rejects.toMatchObject({code: 'BUSY'})
  })

  it('rejects a send with an empty message', async () => {
    const kit = await setup()
    const id = await kit.session()
    await expect(kit.rpc.chat.send({sessionId: id, text: ''})).rejects.toThrow()
  })

  it('keeps per-session state independent under distinct ids', async () => {
    const kit = await setup()
    const a = await kit.session()
    const b = await kit.session()
    await runTurn(kit, 'hi', a)
    const metaA = await metaFor(kit, a)
    const metaB = await metaFor(kit, b)
    expect(metaA?.usage).not.toBeNull()
    expect(metaB?.usage ?? null).toBeNull()
  })

  it('does NOT reject a second session while a different one is busy', async () => {
    const kit = await setup()
    const a = await kit.session()
    const b = await kit.session()
    acquireLock(kit.stateRoot, a, 'chat', process.pid)
    const stream = await kit.attach(b)
    await kit.rpc.chat.send({sessionId: b, text: 'hi'})
    await stream.done()
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
    const ua = (await metaFor(kit, a))?.usage
    const ub = (await metaFor(kit, b))?.usage
    expect(ua?.inputTokens).toBe(111)
    expect(ub?.inputTokens).toBe(222)
    expect(ua?.inputTokens).not.toBe(ub?.inputTokens)
  })

})
