import {describe, expect, it} from 'vitest'
import {pairText} from '../src/lib/pair-text'

describe('pair instructions', () => {
  it('embeds the token in the connect command', () => {
    const text = pairText('tok-xyz', 'https://conciv.dev')
    expect(text).toContain('npx @conciv/connect --token tok-xyz')
    expect(text).toContain('KEEP IT RUNNING')
    expect(text).toContain('https://conciv.dev')
  })
})
