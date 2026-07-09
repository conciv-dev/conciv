import {describe, expect, it} from 'vitest'
import {makeChatFixture} from '../../helpers/chat-fixture.js'
import {makeCompactor} from '../../../src/api/chat/compact.js'

describe('compactor', () => {
  it('runs a compact turn, writes marker, flips compacting during the run', async () => {
    const {chat, uiState, sessionId} = await makeChatFixture()
    const compactor = makeCompactor({chat, uiState, onChange: () => {}})
    const run = compactor.run(sessionId)
    expect(compactor.compacting(sessionId)).toBe(true)
    await run
    expect(compactor.compacting(sessionId)).toBe(false)
    const kinds = (await uiState.listMarkers(sessionId)).map((marker) => marker.kind)
    expect(kinds).toContain('compact')
  })

  it('rejects a concurrent run as busy', async () => {
    const {chat, uiState, sessionId, harness} = await makeChatFixture()
    const compactor = makeCompactor({chat, uiState, onChange: () => {}})
    harness.__scripted.hold()
    const run = compactor.run(sessionId)
    await expect(compactor.run(sessionId)).rejects.toThrow(/busy/)
    harness.__scripted.release()
    await run
  })

  it('notifies onChange at start and end', async () => {
    const {chat, uiState, sessionId} = await makeChatFixture()
    let changes = 0
    const compactor = makeCompactor({
      chat,
      uiState,
      onChange: () => {
        changes += 1
      },
    })
    await compactor.run(sessionId)
    expect(changes).toBe(2)
  })
})
