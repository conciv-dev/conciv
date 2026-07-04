import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {startTestServer, type SpawnHarness, type TestServer} from '../../helpers/server.js'
import {useFakeHarness} from '../../helpers/harness-mode.js'

const fakeIt = it.runIf(useFakeHarness)
const fakeClaude = fileURLToPath(new URL('../../fixtures/fake-claude.ts', import.meta.url))
const dirs: string[] = []

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-detach-it-'))
  dirs.push(dir)
  return dir
}

function slowSpawn(releaseFile: string): SpawnHarness {
  return (args, cwd) => {
    const child = spawn(process.execPath, [fakeClaude, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {...process.env, CONCIV_FAKE_RELEASE_FILE: releaseFile},
    })
    const {stdin, stdout, stderr} = child
    if (!stdout || !stderr) throw new Error('fake-claude did not expose stdout/stderr')
    return {pid: child.pid ?? -1, stdin: stdin ?? undefined, stdout, stderr, kill: () => child.kill('SIGTERM')}
  }
}

const turn = (text: string) => ({id: 'u-live', role: 'user', parts: [{type: 'text', content: text}]})

describe('detached turns (IT)', () => {
  const state = {server: undefined as TestServer | undefined}
  afterEach(async () => {
    if (state.server) await state.server.close()
    state.server = undefined
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  fakeIt('POST /api/chat returns ok JSON before the turn finishes', async () => {
    const releaseFile = join(tmp(), 'release')
    const server = await startTestServer({spawnHarness: slowSpawn(releaseFile)})
    state.server = server
    const id = await server.resolve()
    const response = await server.post('/api/chat', {messages: [turn('hi')]}, id)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ok: true})
    writeFileSync(releaseFile, '')
    const body = await server.attach(id, {until: 'RUN_FINISHED'})
    expect(body).toContain('RUN_FINISHED')
  })

  fakeIt('a mid-run attach replays from RUN_STARTED and continues live', async () => {
    const releaseFile = join(tmp(), 'release')
    const server = await startTestServer({spawnHarness: slowSpawn(releaseFile)})
    state.server = server
    const id = await server.resolve()
    await server.post('/api/chat', {messages: [turn('hi')]}, id)
    const early = await server.attach(id, {until: 'first-half', timeoutMs: 3000})
    expect(early).toContain('RUN_STARTED')
    expect(early).toContain('conciv-snapshot')
    expect(early).toContain('"generating":true')
    writeFileSync(releaseFile, '')
    const late = await server.attach(id, {until: 'RUN_FINISHED'})
    expect(late).toContain('RUN_STARTED')
    expect(late).toContain('first-half')
    expect(late).toContain('second-half')
    expect(late).toContain('RUN_FINISHED')
  })

  fakeIt('the turn completes with zero subscribers and persists usage', async () => {
    const server = await startTestServer({
      spawnHarness: (args, cwd) => {
        const child = spawn(process.execPath, [fakeClaude, ...args], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
        })
        const {stdin, stdout, stderr} = child
        if (!stdout || !stderr) throw new Error('fake-claude did not expose stdout/stderr')
        return {pid: child.pid ?? -1, stdin: stdin ?? undefined, stdout, stderr, kill: () => child.kill('SIGTERM')}
      },
    })
    state.server = server
    const id = await server.resolve()
    await server.post('/api/chat', {messages: [turn('hi')]}, id)
    const deadline = Date.now() + 5000
    let usage: unknown = null
    while (Date.now() < deadline && !usage) {
      const session = (await (await server.getSession(id)).json()) as {usage: unknown}
      usage = session.usage
      if (!usage) await new Promise((r) => setTimeout(r, 50))
    }
    expect(usage).toBeTruthy()
  })

  fakeIt('attach on an idle session emits a snapshot with generating:false', async () => {
    const server = await startTestServer({spawnHarness: slowSpawn(join(tmp(), 'never'))})
    state.server = server
    const id = await server.resolve()
    const body = await server.attach(id, {until: 'conciv-snapshot', timeoutMs: 2000})
    expect(body).toContain('"generating":false')
  })
})
