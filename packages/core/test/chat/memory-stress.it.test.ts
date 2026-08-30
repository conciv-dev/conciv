import {describe, it, expect, afterEach} from 'vitest'
import {EventType} from '@tanstack/ai'
import {createTestHarness, type Kit, type TestHarness} from '@conciv/harness-testkit'
import {bootKit} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'
import {hydratedSnapshot} from '../helpers/fake-session.js'
import {userTexts} from '../helpers/snapshots.js'

const SESSIONS = 4
const WARMUP_RUNS = 8
const MEASURED_RUNS = 48
const CHURN_JOINERS = 2
const HEAP_CEILING_BYTES = 7 * 1024 * 1024

const heapProbe: {gc?: () => void} = globalThis

async function settledHeapUsed(): Promise<number> {
  const collect = heapProbe.gc
  if (!collect) throw new Error('memory stress requires --expose-gc (execArgv in vitest.config.ts)')
  for (let round = 0; round < 3; round += 1) {
    collect()
    await new Promise((resolve) => setImmediate(resolve))
  }
  return process.memoryUsage().heapUsed
}

describe('sustained chat load keeps server memory flat (IT)', () => {
  const state: {kit?: Kit} = {}
  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
  })

  async function drive(kit: Kit, harness: TestHarness, sessionId: string, runId: string): Promise<void> {
    harness.script.hold()
    const owner = await kit.turn(`load ${runId}`, {session: sessionId, runId: runId})
    await owner.waitForRunStart()
    for (let index = 0; index < CHURN_JOINERS; index += 1) kit.join(runId)
    harness.script.release()
    await owner.done({hangGuardMs: 10_000})
  }

  it(
    'joiner churn across many runs stays under the heap ceiling and leaves clean sessions',
    {
      timeout: 90_000,
    },
    async () => {
      const harness = createTestHarness(requireClaude())
      const kit = await bootKit({}, harness)
      state.kit = kit
      const sessionIds: string[] = []
      for (let index = 0; index < SESSIONS; index += 1) {
        sessionIds.push(await kit.session(`conciv_memory_stress_${index}`))
      }
      const sessionFor = (run: number): string => {
        const id = sessionIds[run % SESSIONS]
        if (!id) throw new Error('session rotation out of range')
        return id
      }
      for (let run = 0; run < WARMUP_RUNS; run += 1) {
        await drive(kit, harness, sessionFor(run), `memory-warmup-${run}`)
      }
      const heapBefore = await settledHeapUsed()
      for (let run = 0; run < MEASURED_RUNS; run += 1) {
        await drive(kit, harness, sessionFor(run), `memory-load-${run}`)
      }
      const heapAfter = await settledHeapUsed()
      const delta = heapAfter - heapBefore
      expect(
        delta,
        `heap grew ${delta} bytes over ${MEASURED_RUNS} runs; observed baseline is ~1.5MB, ceiling ${HEAP_CEILING_BYTES} allows the known per-run event-log retention but not an order-of-magnitude regression`,
      ).toBeLessThan(HEAP_CEILING_BYTES)

      const metas = await kit.rpc.sessions.list(undefined)
      for (const sessionId of sessionIds) {
        expect(metas.find((meta) => meta.id === sessionId)?.running).toBe(false)
      }

      const freshSession = sessionFor(0)
      const fresh = await kit.turn('after the load', {session: freshSession, runId: 'memory-fresh'})
      const events = await fresh.done({hangGuardMs: 10_000})
      expect(events.runs()).toBe(1)
      expect(events.all.filter((chunk) => chunk.type === EventType.RUN_STARTED)).toHaveLength(1)
      const hydrated = userTexts(await hydratedSnapshot(kit, freshSession))
      expect(hydrated.filter((text) => text === 'after the load')).toEqual(['after the load'])
    },
  )
})
