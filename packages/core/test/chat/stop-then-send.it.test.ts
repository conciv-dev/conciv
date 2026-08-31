import {describe, it, afterEach} from 'vitest'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

describe('stop then send (IT)', () => {
  const state = {kit: undefined as Kit | undefined}

  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
  })

  it('a send right after stop is accepted and starts a fresh run', {timeout: 30_000}, async () => {
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: () => ({CONCIV_FAKE_HANG: '1'})}})).setup()
    state.kit = kit
    const id = await kit.session()
    const stream = await kit.turn('hang around', {session: id, runId: 'stop-then-send-1'})
    await stream.waitForRunStart()
    await kit.rpc.chat.stop({sessionId: id})
    const followUp = await kit.turn('follow up', {session: id, runId: 'stop-then-send-2'})
    await followUp.waitForRunStart({runId: 'stop-then-send-2'})
    await kit.rpc.chat.stop({sessionId: id})
  })
})
