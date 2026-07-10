import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {defineHarness, type HarnessAdapter} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {createTestkit, until} from '@conciv/harness-testkit'
import {readLock} from '../../src/store/lock.js'
import {bootCoreApp} from '../helpers/boot.js'

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

async function* failingGenerator(): AsyncGenerator<StreamChunk> {
  await Promise.reject(new Error(FAIL))
  const none: StreamChunk[] = []
  yield* none
}

const failingHarness = defineHarness({
  id: 'fake-failing',
  binName: 'true',
  chatConfig: () => ({adapter: makeTextAdapter('fake-failing', () => failingGenerator())}),
  capabilities: baseCaps,
})

async function failingTurn(harness: HarnessAdapter): Promise<{seedCalls: string[]; runError: StreamChunk}> {
  const original = console.error
  const calls: string[] = []
  console.error = (...args: unknown[]) => void calls.push(args.map((a) => String(a)).join(' '))
  const kit = await createTestkit(harness, bootCoreApp()).setup()
  try {
    const id = await kit.session()
    const stream = await kit.attach(id)
    await kit.rpc.chat.send({sessionId: id, text: 'hi'})
    const runError = await stream.waitFor((chunk) => chunk.type === EventType.RUN_ERROR, {hangGuardMs: 5000})
    await until(() => !readLock(kit.stateRoot, id).held, {hangGuardMs: 5000})
    const seedCalls = calls.filter((c) => c.includes('chat run failed') || c.includes('tanstack-ai'))
    return {seedCalls, runError}
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

  it('a chatStream failure does not call console.error', async () => {
    const {seedCalls, runError} = await failingTurn(failingHarness)
    expect(seedCalls).toEqual([])
    expect(runError.type).toBe(EventType.RUN_ERROR)
  })
})
