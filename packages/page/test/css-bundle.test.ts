import {describe, expect, it} from 'vitest'
import {hashCssText} from '../src/css-bundle.js'

describe('hashCssText', () => {
  it('hashes with SHA-256 and keeps the css prefix', async () => {
    const hash = await hashCssText('.a{color:red}')
    expect(hash).toMatch(/^css[0-9a-f]{16}$/)
  })

  it('is stable for the same input and differs for different input', async () => {
    const first = await hashCssText('.a{color:red}')
    const second = await hashCssText('.a{color:red}')
    const third = await hashCssText('.b{color:blue}')
    expect(first).toBe(second)
    expect(first).not.toBe(third)
  })
})
