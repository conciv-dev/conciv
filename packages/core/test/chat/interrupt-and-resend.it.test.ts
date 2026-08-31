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

    kit.harness.script.hold()
    const stream = await kit.turn('the interrupted instruction', {session: sessionId, runId: 'resend-first'})
    await stream.waitForRunStart()

    const resent = await kit.turn('the resent instruction', {session: sessionId, runId: 'resend-second'})
    kit.harness.script.release()

    const first = await stream.done({hangGuardMs: 500})
    const second = await resent.done({hangGuardMs: 20_000})
    expect(runBoundaries(first.all)).toContain('end:resend-first')
    expect(runBoundaries(second.all)).toContain('start:resend-second')
  })
})
