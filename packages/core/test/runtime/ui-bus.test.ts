import {describe, it, expect} from 'vitest'
import {makeUiBus} from '../../src/runtime/ui-bus.js'
import {EventType} from '@tanstack/ai'

async function* slow(chunk: unknown): AsyncGenerator<unknown> {
  yield chunk
  await new Promise((r) => setTimeout(r, 5))
}

describe('uiBus per-session channels', () => {
  it('routes inject to the matching header id only', async () => {
    const bus = makeUiBus()
    const a = bus.run('h-a', slow({type: EventType.RUN_STARTED}) as never)
    const b = bus.run('h-b', slow({type: EventType.RUN_STARTED}) as never)
    expect(bus.inject('h-a', {renderId: 'r1', kind: 'card'} as never)).toBe(true)
    expect(bus.inject('h-missing', {renderId: 'r2', kind: 'card'} as never)).toBe(false)
    const drain = async (g: AsyncGenerator<unknown>) => {
      const o: unknown[] = []
      for await (const c of g) o.push(c)
      return o
    }
    const [ca, cb] = await Promise.all([drain(a), drain(b)])
    const custom = (cs: unknown[]) => cs.filter((c) => (c as {type: string}).type === EventType.CUSTOM)
    expect(custom(ca).length).toBe(1)
    expect(custom(cb).length).toBe(0)
  })
})
