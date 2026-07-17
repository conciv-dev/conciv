import {describe, expect, it} from 'vitest'
import {pairResponse, pairText} from '../src/lib/pair-text'

describe('pair instructions', () => {
  it('embeds the token in the connect command', () => {
    const text = pairText('tok-xyz', 'https://conciv.dev')
    expect(text).toContain('npx @conciv/try --token tok-xyz')
    expect(text).toContain('KEEP IT RUNNING')
    expect(text).toContain('https://conciv.dev')
    expect(text).toContain('Browser access from https://conciv.dev is gated by this token')
    expect(text).not.toContain('reachable only')
  })

  it('serves the instructions as plain text with the token embedded', async () => {
    const response = pairResponse('tok-route', 'https://conciv.dev')
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await response.text()).toContain('npx @conciv/try --token tok-route')
  })
})
