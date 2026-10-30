import {afterEach, describe, expect, it} from 'vitest'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

describe('stop is scoped to the runs the client saw (IT)', () => {
  const state = {kit: undefined as Kit | undefined}

  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
  })

  it('a stop that lands after the next turn was claimed leaves that next turn running', {timeout: 30_000}, async () => {
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: () => ({CONCIV_FAKE_HANG: '1'})}})).setup()
    state.kit = kit
    const sessionId = await kit.session()
    const first = await kit.turn('hang around', {session: sessionId, runId: 'scoped-stop-first'})
    await first.waitForRunStart()
    const next = await kit.turn('steer here instead', {session: sessionId, runId: 'scoped-stop-next'})
    await next.waitForRunStart({runId: 'scoped-stop-next'})

    await kit.rpc.chat.stop({sessionId, runIds: ['scoped-stop-first']})

    const hydration = await kit.hydrate(sessionId)
    expect(hydration.activeRun).toEqual({runId: 'scoped-stop-next'})
    expect(hydration.lastRun).toMatchObject({runId: 'scoped-stop-next', phase: 'running'})

    await kit.rpc.chat.stop({sessionId, runIds: ['scoped-stop-next']})
    expect((await kit.hydrate(sessionId)).activeRun).toBeNull()
  })
})
