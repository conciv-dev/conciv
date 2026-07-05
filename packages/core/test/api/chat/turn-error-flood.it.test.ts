import {spawn} from 'node:child_process'
import {afterEach, describe, expect, it} from 'vitest'
import type {StreamChunk} from '@tanstack/ai'
import {defineHarness, type HarnessChild} from '@conciv/protocol/harness-types'
import {registerHarness} from '@conciv/harness'
import {startTestServer, type SpawnHarness, type TestServer} from '../../helpers/server.js'
import {readLock} from '../../../src/store/lock.js'

const FAIL = 'harness exited with code 143'

const baseCaps = {
  resume: false,
  permissionGate: 'none',
  transcriptHistory: false,
  compaction: false,
  systemPrompt: 'none',
  mcp: 'none',
  slashCommands: 'none',
  imageInput: false,
} as const

registerHarness(
  defineHarness({
    id: 'fake-run',
    binName: 'true',
    buildArgs: () => [],
    decode: async function* () {},
    run: () => failingGenerator(),
    capabilities: baseCaps,
  }),
)

registerHarness(
  defineHarness({
    id: 'fake-decode',
    binName: 'true',
    buildArgs: () => [],
    decode: () => failingGenerator(),
    capabilities: baseCaps,
  }),
)

async function* failingGenerator(): AsyncGenerator<StreamChunk> {
  await Promise.reject(new Error(FAIL))
  const none: StreamChunk[] = []
  yield* none
}

const noopSpawn: SpawnHarness = (): HarnessChild => {
  const child = spawn('node', ['-e', ''], {stdio: ['pipe', 'pipe', 'pipe']})
  const {stdin, stdout, stderr} = child
  if (!stdin || !stdout || !stderr) throw new Error('child missing stdio pipes')
  return {pid: child.pid ?? -1, stdin, stdout, stderr, kill: () => void child.kill('SIGTERM')}
}

async function failingTurn(opts: Parameters<typeof startTestServer>[0]): Promise<{seedCalls: string[]; body: string}> {
  const original = console.error
  const calls: string[] = []
  console.error = (...args: unknown[]) => void calls.push(args.map((a) => String(a)).join(' '))
  let server: TestServer | undefined
  try {
    server = await startTestServer(opts)
    const id = await server.resolve()
    const response = await server.post('/api/chat', {messages: [{role: 'user', content: 'hi'}]}, id)
    const body = await response.text()
    const deadline = Date.now() + 5000
    while (readLock(server.stateRoot, id).held && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    const seedCalls = calls.filter((c) => c.includes('chat run failed') || c.includes('tanstack-ai'))
    return {seedCalls, body}
  } finally {
    console.error = original
    await server?.close()
  }
}

describe('a failed turn must not seed the dev-server console flood', () => {
  let active: Promise<unknown> | undefined
  afterEach(async () => {
    await active
    active = undefined
  })

  it('SDK-shape run() failure does not call console.error', async () => {
    const {seedCalls, body} = await failingTurn({harness: 'fake-run'})
    expect(seedCalls).toEqual([])
    expect(body.length).toBeGreaterThan(0)
  })

  it('CLI-shape decode() failure does not call console.error', async () => {
    const {seedCalls, body} = await failingTurn({harness: 'fake-decode', spawnHarness: noopSpawn})
    expect(seedCalls).toEqual([])
    expect(body.length).toBeGreaterThan(0)
  })
})
