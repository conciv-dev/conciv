import {afterEach, describe, expect, it} from 'vitest'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

describe('deleting a session settles its live run before pruning it (IT)', () => {
  const state = {kit: undefined as Kit | undefined}

  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
  })

  it('ends the in-flight run instead of deleting its record out from under it', {timeout: 30_000}, async () => {
    const kit = await createTestkit(
      requireClaude(),
      bootCoreApp({fakeClaude: {env: () => ({CONCIV_FAKE_HANG: '1'})}}),
    ).setup()
    state.kit = kit
    const id = await kit.session()
    const stream = await kit.attach(id)
    await kit.rpc.chat.send({runId: 'session-delete-settles-1', sessionId: id, text: 'hang around'})
    await stream.waitForRunStart()
    await kit.rpc.sessions.delete({sessionId: id})
    await expect(stream.done({hangGuardMs: 10_000})).resolves.toBeDefined()
  })
})
