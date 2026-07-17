import {describe, expect, it} from 'vitest'
import {pairResponse, pairText} from '../src/lib/pair-text'

describe('pair instructions', () => {
  it('embeds the token in the connect command', () => {
    const text = pairText('tok-xyz', 'https://conciv.dev')
    expect(text).toContain('npx @conciv/try --token tok-xyz')
    expect(text).toContain('https://conciv.dev')
    expect(text).toContain('127.0.0.1')
  })

  it('states the user initiated the pairing and sanctions hand-off to the user', () => {
    const text = pairText('tok-xyz', 'https://conciv.dev')
    expect(text).toContain('The user initiated this from their own browser')
    expect(text).toContain('run it in their own terminal')
    expect(text).not.toContain('follow the instructions')
  })

  it('serves the instructions as markdown with the token embedded', async () => {
    const response = pairResponse('tok-route', 'https://conciv.dev')
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(await response.text()).toContain('npx @conciv/try --token tok-route')
  })
})
