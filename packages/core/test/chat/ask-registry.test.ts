import {describe, expect, it} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import {createAskRegistry} from '../../src/chat/ask.js'

const SESSION = SessionId.parse('conciv_s')

describe('createAskRegistry stale continuations', () => {
  it('a waitFor continuation settled by cancel leaves a newer session bucket alone', async () => {
    const asks = createAskRegistry()
    asks.open(SESSION, 'ask-old')
    const pending = asks.waitFor(SESSION, 'ask-old', 5_000)
    asks.cancel(SESSION)
    asks.open(SESSION, 'ask-new')
    await expect(pending).resolves.toBeNull()
    expect(asks.pending(SESSION)).toEqual(['ask-new'])
  })

  it('a normally answered waitFor still clears its own emptied bucket', async () => {
    const asks = createAskRegistry()
    asks.open(SESSION, 'ask-1')
    const pending = asks.waitFor(SESSION, 'ask-1', 5_000)
    expect(asks.reply(SESSION, 'ask-1', true)).toBe(true)
    await expect(pending).resolves.toBe(true)
    expect(asks.pending(SESSION)).toEqual([])
    expect(asks.owner('ask-1')).toBeNull()
  })
})
