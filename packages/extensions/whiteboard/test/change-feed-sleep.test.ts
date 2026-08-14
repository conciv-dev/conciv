import {describe, expect, it, vi} from 'vitest'
import {sleep} from '../src/client/change-feed.js'

describe('sleep', () => {
  it('removes its abort listener once the timer resolves normally, so fast resubscriptions do not accumulate listeners', async () => {
    const controller = new AbortController()
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener')
    await sleep(0, controller.signal)
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('resolves immediately when the signal aborts before the timer fires', async () => {
    const controller = new AbortController()
    const pending = sleep(10_000, controller.signal)
    controller.abort()
    await pending
  })
})
