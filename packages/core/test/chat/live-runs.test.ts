import {describe, expect, it} from 'vitest'
import {createLiveRuns} from '../../src/chat/live-runs.js'

describe('live run serialization', () => {
  it('runs one section at a time per session and lets other sessions through', async () => {
    const live = createLiveRuns()
    const order: string[] = []
    const held = {release: () => {}}
    const blocked = new Promise<void>((resolve) => {
      held.release = resolve
    })

    const first = live.serialize('a', async () => {
      order.push('a1 enter')
      await blocked
      order.push('a1 leave')
    })
    const second = live.serialize('a', async () => {
      order.push('a2 enter')
    })
    const other = live.serialize('b', async () => {
      order.push('b1 enter')
    })

    await other
    expect(order).toEqual(['a1 enter', 'b1 enter'])

    held.release()
    await Promise.all([first, second])
    expect(order).toEqual(['a1 enter', 'b1 enter', 'a1 leave', 'a2 enter'])
  })

  it('a section that throws still releases the session so the next one runs', async () => {
    const live = createLiveRuns()
    const failing = live.serialize('a', () => Promise.reject(new Error('section failed')))
    await expect(failing).rejects.toThrow('section failed')
    await expect(live.serialize('a', () => Promise.resolve('next'))).resolves.toBe('next')
  })
})
