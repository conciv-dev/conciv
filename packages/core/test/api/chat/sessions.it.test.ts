import {describe, it, expect, afterEach} from 'vitest'
import {spawn} from 'node:child_process'
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {ChatSessionsSchema} from '@aidx/protocol/chat-types'
import {writeSession} from '../../../src/store/session-store.js'
import {startTestServer, type SpawnHarness, type TestServer} from '../../helpers/server.js'

// GET /api/chat/sessions joins the harness transcript list to the previewId map (origin/running/
// usage) — proven here against a REAL temp ~/.claude with seeded transcripts.

const fakeClaude = fileURLToPath(new URL('../../fixtures/fake-claude.ts', import.meta.url))
const homes: string[] = []

// Claude's project-dir encoding (mirrors claude/history.encodeProjectDir — trivial + stable).
const encodeProjectDir = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, '-')

function projectDir(home: string, cwd: string): string {
  const dir = join(home, '.claude', 'projects', encodeProjectDir(cwd))
  mkdirSync(dir, {recursive: true})
  return dir
}
function seedTranscript(dir: string, id: string, firstUserText: string): void {
  writeFileSync(join(dir, `${id}.jsonl`), JSON.stringify({type: 'user', message: {content: firstUserText}}) + '\n')
}
function tmpHome(): string {
  const h = mkdtempSync(join(tmpdir(), 'aidx-home-'))
  homes.push(h)
  return h
}
function fakeSpawn(): SpawnHarness {
  return (args, cwd) => {
    const child = spawn(process.execPath, [fakeClaude, ...args], {cwd, stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env}})
    const {stdin, stdout, stderr} = child
    if (!stdout || !stderr) throw new Error('fake-claude did not expose stdout/stderr')
    return {pid: child.pid ?? -1, stdin: stdin ?? undefined, stdout, stderr, kill: () => child.kill('SIGTERM')}
  }
}

describe('GET /api/chat/sessions + rename (IT, real temp ~/.claude)', () => {
  const state = {server: undefined as TestServer | undefined}
  afterEach(async () => {
    if (state.server) await state.server.close()
    state.server = undefined
    for (const h of homes.splice(0)) rmSync(h, {recursive: true, force: true})
  })

  it('lists sessions with origin/title joined to the previewId map', async () => {
    const home = tmpHome()
    const cwd = process.cwd()
    const dir = projectDir(home, cwd)
    seedTranscript(dir, 'tok-aidx', 'made in aidx')
    seedTranscript(dir, 'tok-ext', 'made in terminal')
    const server = await startTestServer({cwd, claudeHome: home, spawnHarness: fakeSpawn()})
    state.server = server
    // Map a client uuid -> tok-aidx so origin resolves to 'aidx'; tok-ext stays external.
    writeSession(server.stateRoot, server.previewId, 'uuid-1', 'tok-aidx')
    const {sessions} = ChatSessionsSchema.parse(await (await server.getSessions()).json())
    expect(sessions.find((s) => s.id === 'tok-aidx')?.origin).toBe('aidx')
    expect(sessions.find((s) => s.id === 'tok-ext')?.origin).toBe('external')
    expect(sessions.find((s) => s.id === 'tok-aidx')?.title).toBe('made in aidx')
  })

  it('rename persists into the next list', async () => {
    const home = tmpHome()
    const cwd = process.cwd()
    seedTranscript(projectDir(home, cwd), 'tok-ext', 'made in terminal')
    const server = await startTestServer({cwd, claudeHome: home, spawnHarness: fakeSpawn()})
    state.server = server
    await server.post('/api/chat/sessions/title', {sessionId: 'tok-ext', title: 'My title'})
    const {sessions} = ChatSessionsSchema.parse(await (await server.getSessions()).json())
    expect(sessions.find((s) => s.id === 'tok-ext')?.title).toBe('My title')
  })

  it('rejects a bad session id', async () => {
    const server = await startTestServer({claudeHome: tmpHome(), spawnHarness: fakeSpawn()})
    state.server = server
    const res = await server.post('/api/chat/sessions/title', {sessionId: '../etc', title: 'x'})
    expect(res.status).toBe(400)
  })
})
