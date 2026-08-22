import {randomUUID} from 'node:crypto'
import {chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {bashHarness, connectingHarness, startTerminalServer, type TerminalTestServer} from './helpers.js'

const OPENER_BINS = ['open', 'x-terminal-emulator', 'cmd']

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function fakeOpenerDir(): string {
  const dir = tempDir('conciv-opener-')
  for (const bin of OPENER_BINS) {
    const path = join(dir, bin)
    writeFileSync(path, '#!/bin/sh\nexit 0\n')
    chmodSync(path, 0o755)
  }
  return dir
}

function launchScripts(stateDir: string): string[] {
  return readdirSync(join(stateDir, 'launch')).map((name) => readFileSync(join(stateDir, 'launch', name), 'utf8'))
}

describe('terminal launch and connect command', () => {
  const started: TerminalTestServer[] = []
  const originalPath = process.env.PATH

  afterEach(async () => {
    process.env.PATH = originalPath
    await Promise.all(started.splice(0).map((server) => server.close()))
  })

  const start = async (harness = connectingHarness().harness): Promise<TerminalTestServer> => {
    const server = await startTerminalServer(harness, {stateDir: tempDir('conciv-launch-state-')})
    started.push(server)
    return server
  }

  it('renders the copyable connect command from the harness plan', async () => {
    const sessionId = `conciv_${randomUUID()}`
    const server = await start()
    const {command} = await server.rpc.connectCommand({sessionId})
    expect(command).toContain(`cd '${process.cwd()}'`)
    expect(command).toContain("CONCIV_LAUNCH='yes'")
    expect(command).toContain("'fake-cli' '--session' 'new'")
    expect(command).toMatch(/'--mcp' 'http:\/\/127\.0\.0\.1:\d+\/api\/mcp'/)
  })

  it('renders a connect command whose mcp url carries the app base path', async () => {
    const sessionId = `conciv_${randomUUID()}`
    const server = await startTerminalServer(connectingHarness().harness, {
      basePath: '/t/tok-launch',
      stateDir: tempDir('conciv-launch-state-'),
    })
    started.push(server)
    const {command} = await server.rpc.connectCommand({sessionId})
    expect(command).toMatch(/'--mcp' 'http:\/\/127\.0\.0\.1:\d+\/t\/tok-launch\/api\/mcp'/)
  })

  it('passes the session identity and no resume to the plan for a session with no native id', async () => {
    const sessionId = `conciv_${randomUUID()}`
    const {harness, captured} = connectingHarness()
    const server = await start(harness)
    await server.rpc.connectCommand({sessionId})
    expect(captured).toHaveLength(1)
    expect(captured[0]?.concivSessionId).toBe(sessionId)
    expect(captured[0]?.harnessSessionId).toBeNull()
    expect(captured[0]?.resume).toBe(false)
    expect(server.sessions.tokens.get(sessionId)).toBeUndefined()
  })

  it('resumes the recorded native id when the session already has one', async () => {
    const sessionId = `conciv_${randomUUID()}`
    const {harness, captured} = connectingHarness()
    const server = await start({...harness, transcriptExists: () => true})
    server.sessions.tokens.set(sessionId, HarnessSessionId.parse('native-7'))
    await server.rpc.connectCommand({sessionId})
    expect(captured[0]?.harnessSessionId).toBe('native-7')
    expect(captured[0]?.resume).toBe(true)
  })

  it('launches a terminal window and leaves the plan as a runnable script', async () => {
    const sessionId = `conciv_${randomUUID()}`
    const server = await start()
    process.env.PATH = fakeOpenerDir()
    expect(await server.rpc.launch({sessionId})).toEqual({ok: true})
    const scripts = launchScripts(server.stateDir)
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toContain(`cd '${process.cwd()}'`)
    expect(scripts[0]).toContain("'fake-cli'")
  })

  it('reports a failed launch when no terminal opener is on the path', async () => {
    const sessionId = `conciv_${randomUUID()}`
    const server = await start()
    process.env.PATH = tempDir('conciv-empty-path-')
    expect(await server.rpc.launch({sessionId})).toEqual({ok: false})
  })

  it('rejects launch and connectCommand when the harness cannot be launched', async () => {
    const sessionId = `conciv_${randomUUID()}`
    const server = await start(bashHarness)
    await expect(server.rpc.launch({sessionId})).rejects.toMatchObject({code: 'NO_CONNECT'})
    await expect(server.rpc.connectCommand({sessionId})).rejects.toMatchObject({code: 'NO_CONNECT'})
  })
})
