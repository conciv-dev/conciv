import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {createTestkit, createFakeHarness, type FakeHarness, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'

type LifecycleKit = Kit & {harness: FakeHarness}

async function bootFakeKit(): Promise<LifecycleKit> {
  const harness = createFakeHarness({id: 'fake-interrupt', text: 'ok'})
  const kit = await createTestkit(harness, bootCoreApp()).setup()
  return {...kit, harness}
}

function runBoundaries(chunks: readonly StreamChunk[]): string[] {
  return chunks.flatMap((chunk) => {
    if (chunk.type === EventType.RUN_STARTED) return [`start:${'runId' in chunk ? chunk.runId : ''}`]
    if (chunk.type === EventType.RUN_FINISHED || chunk.type === EventType.RUN_ERROR)
      return [`end:${'runId' in chunk ? chunk.runId : ''}`]
    return []
  })
}

describe('interrupt and resend without a client-side stop (IT)', () => {
  const state = {kit: undefined as LifecycleKit | undefined}

  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
  })

  it('settles the in-flight run before the resent run starts, with no stop call between the sends', async () => {
    const kit = await bootFakeKit()
    state.kit = kit
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)

    kit.harness.script.hold()
    await kit.rpc.chat.send({runId: 'resend-first', sessionId, text: 'the interrupted instruction'})
    await stream.waitFor((chunk) => chunk.type === EventType.RUN_STARTED, {hangGuardMs: 10_000})

    const resent = kit.rpc.chat.send({runId: 'resend-second', sessionId, text: 'the resent instruction'})
    kit.harness.script.release()
    await expect(resent).resolves.toEqual({ok: true, runId: 'resend-second'})

    await stream.done({hangGuardMs: 20_000})
    const events = await stream.done({hangGuardMs: 20_000})
    const boundaries = runBoundaries(events.all)
    expect(boundaries.indexOf('end:resend-first')).toBeGreaterThanOrEqual(0)
    expect(boundaries.indexOf('start:resend-second')).toBeGreaterThan(boundaries.indexOf('end:resend-first'))
    expect(boundaries.indexOf('start:resend-second')).toBeGreaterThan(boundaries.indexOf('start:resend-first'))
  })
})
