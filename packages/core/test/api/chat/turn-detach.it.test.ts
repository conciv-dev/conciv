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

function fakeSpawn(extraEnv: NodeJS.ProcessEnv): SpawnHarness {
  return (args, cwd) => {
    const child = spawn(process.execPath, [fakeClaude, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {...process.env, ...extraEnv},
    })
    const {stdin, stdout, stderr} = child
    if (!stdout || !stderr) throw new Error('fake-claude did not expose stdout/stderr')
    return {pid: child.pid ?? -1, stdin: stdin ?? undefined, stdout, stderr, kill: () => child.kill('SIGTERM')}
  }
}

function slowSpawn(releaseFile: string): SpawnHarness {
  return fakeSpawn({CONCIV_FAKE_RELEASE_FILE: releaseFile})
}

function hangSpawn(): SpawnHarness {
  return fakeSpawn({CONCIV_FAKE_HANG: '1'})
}

const turn = (text: string) => ({id: 'u-live', role: 'user', parts: [{type: 'text', content: text}]})
const contentTurn = (text: string) => ({role: 'user', content: text})

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

  fakeIt('a dropped and re-opened attach sees the complete turn (reload simulation)', async () => {
    const releaseFile = join(tmp(), 'release')
    const server = await startTestServer({spawnHarness: slowSpawn(releaseFile)})
    state.server = server
    const id = await server.resolve()
    await server.post('/api/chat', {messages: [turn('rebuild the page')]}, id)
    const before = await server.attach(id, {until: 'first-half', timeoutMs: 3000})
    expect(before).toContain('"generating":true')
    expect(before).toContain('rebuild the page')
    writeFileSync(releaseFile, '')
    const after = await server.attach(id, {until: 'RUN_FINISHED'})
    expect(after).toContain('first-half')
    expect(after).toContain('second-half')
    expect(after).toContain('RUN_FINISHED')
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

  fakeIt('attach during a content-form (parts-less) turn returns a snapshot with the user text, not 500', async () => {
    const releaseFile = join(tmp(), 'release')
    const server = await startTestServer({spawnHarness: slowSpawn(releaseFile)})
    state.server = server
    const id = await server.resolve()
    const response = await server.post('/api/chat', {messages: [contentTurn('summarize this')]}, id)
    expect(response.status).toBe(200)
    const early = await server.attach(id, {until: 'first-half', timeoutMs: 3000})
    expect(early).toContain('conciv-snapshot')
    expect(early).toContain('"generating":true')
    expect(early).toContain('summarize this')
    writeFileSync(releaseFile, '')
    const late = await server.attach(id, {until: 'RUN_FINISHED'})
    expect(late).toContain('RUN_FINISHED')
  })

  fakeIt('a deliberate stop ends the turn with a clean terminal chunk, not a RUN_ERROR banner', async () => {
    const server = await startTestServer({spawnHarness: hangSpawn()})
    state.server = server
    const id = await server.resolve()
    await server.post('/api/chat', {messages: [turn('hang around')]}, id)
    const controller = new AbortController()
    const response = await fetch(`${server.base}/api/chat/attach`, {
      headers: {'conciv-session-id': id},
      signal: controller.signal,
    })
    const reader = response.body?.getReader()
    if (!reader) throw new Error('attach returned no body')
    const decoder = new TextDecoder()
    let body = ''
    const readUntilTerminal = async (): Promise<void> => {
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        const {value, done} = await reader.read()
        if (done) break
        body += decoder.decode(value, {stream: true})
        if (body.includes('RUN_FINISHED') || body.includes('RUN_ERROR')) break
      }
    }
    const reading = readUntilTerminal()
    await new Promise((resolve) => setTimeout(resolve, 400))
    await server.post('/api/chat/stop', {}, id)
    await reading
    controller.abort()
    expect(body).toContain('RUN_FINISHED')
    expect(body).not.toContain('RUN_ERROR')
    expect(body).not.toContain('143')
  })

  fakeIt('attach on an idle session emits a snapshot with generating:false', async () => {
    const server = await startTestServer({spawnHarness: slowSpawn(join(tmp(), 'never'))})
    state.server = server
    const id = await server.resolve()
    const body = await server.attach(id, {until: 'conciv-snapshot', timeoutMs: 2000})
    expect(body).toContain('"generating":false')
  })
})
