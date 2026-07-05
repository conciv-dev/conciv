import {spawn} from 'node:child_process'
import {afterEach, describe, expect, it} from 'vitest'
import type {StreamChunk} from '@tanstack/ai'
import {defineHarness, type HarnessAdapter, type HarnessChild} from '@conciv/protocol/harness-types'
import {createTestkit, until} from '@conciv/harness-testkit'
import {readLock} from '../../../src/store/lock.js'
import {bootCoreApp, type SpawnHarness} from '../../helpers/boot.js'

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

const fakeRun = defineHarness({
  id: 'fake-run',
  binName: 'true',
  buildArgs: () => [],
  decode: async function* () {},
  run: () => failingGenerator(),
  capabilities: baseCaps,
})

const fakeDecode = defineHarness({
  id: 'fake-decode',
  binName: 'true',
  buildArgs: () => [],
  decode: () => failingGenerator(),
  capabilities: baseCaps,
})

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

async function failingTurn(
  harness: HarnessAdapter,
  spawnHarness?: SpawnHarness,
): Promise<{seedCalls: string[]; body: string}> {
  const original = console.error
  const calls: string[] = []
  console.error = (...args: unknown[]) => void calls.push(args.map((a) => String(a)).join(' '))
  const kit = await createTestkit(harness, bootCoreApp({spawn: spawnHarness})).setup()
  try {
    const id = await kit.session()
    const response = await kit.post('/api/chat', {messages: [{role: 'user', content: 'hi'}]}, id)
    const body = await response.text()
    await until(() => !readLock(kit.stateRoot, id).held, {hangGuardMs: 5000})
    const seedCalls = calls.filter((c) => c.includes('chat run failed') || c.includes('tanstack-ai'))
    return {seedCalls, body}
  } finally {
    console.error = original
    await kit.cleanup()
  }
}

describe('a failed turn must not seed the dev-server console flood', () => {
  let active: Promise<unknown> | undefined
  afterEach(async () => {
    await active
    active = undefined
  })

  it('SDK-shape run() failure does not call console.error', async () => {
    const {seedCalls, body} = await failingTurn(fakeRun)
    expect(seedCalls).toEqual([])
    expect(body.length).toBeGreaterThan(0)
  })

  it('CLI-shape decode() failure does not call console.error', async () => {
    const {seedCalls, body} = await failingTurn(fakeDecode, noopSpawn)
    expect(seedCalls).toEqual([])
    expect(body.length).toBeGreaterThan(0)
  })
})
