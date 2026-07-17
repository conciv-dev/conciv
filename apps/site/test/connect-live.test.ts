import {describe, expect, it} from 'vitest'
import {probeCore} from '../src/lib/connect-live'

function fakeFetch(alivePort: number): typeof fetch {
  return async (input) => {
    const url = String(input)
    if (url.includes(`:${alivePort}/`)) return new Response('{"ok":true}', {status: 200})
    throw new TypeError('connection refused')
  }
}

describe('probeCore', () => {
  it('returns the gated base of the healthy port', async () => {
    const base = await probeCore('tok-1', [4732, 4733, 4734], fakeFetch(4733))
    expect(base).toBe('http://127.0.0.1:4733/t/tok-1')
  })

  it('returns null when nothing answers', async () => {
    const base = await probeCore('tok-1', [4732, 4733], fakeFetch(9999))
    expect(base).toBeNull()
  })
})
