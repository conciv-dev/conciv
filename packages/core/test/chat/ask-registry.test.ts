import {describe, expect, it} from 'vitest'
import {createAskRegistry} from '../../src/chat/ask.js'

describe('createAskRegistry stale continuations', () => {
  it('a waitFor continuation settled by cancel leaves a newer session bucket alone', async () => {
    const asks = createAskRegistry()
    asks.open('conciv_s', 'ask-old')
    const pending = asks.waitFor('conciv_s', 'ask-old', 5_000)
    asks.cancel('conciv_s')
    asks.open('conciv_s', 'ask-new')
    await expect(pending).resolves.toBeNull()
    expect(asks.pending('conciv_s')).toEqual(['ask-new'])
  })

  it('a normally answered waitFor still clears its own emptied bucket', async () => {
    const asks = createAskRegistry()
    asks.open('conciv_s', 'ask-1')
    const pending = asks.waitFor('conciv_s', 'ask-1', 5_000)
    expect(asks.reply('conciv_s', 'ask-1', true)).toBe(true)
    await expect(pending).resolves.toBe(true)
    expect(asks.pending('conciv_s')).toEqual([])
    expect(asks.owner('ask-1')).toBeNull()
  })
})
