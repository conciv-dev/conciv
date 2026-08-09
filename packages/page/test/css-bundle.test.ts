import {describe, expect, it} from 'vitest'
import {hashCssText, makeCssBundleDeduper} from '../src/css-bundle.js'

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

describe('makeCssBundleDeduper', () => {
  it('ships the full bundle the first time and only the hash afterwards', async () => {
    const shipCss = makeCssBundleDeduper()
    const first = await shipCss({css: '.a{color:red}'})
    const second = await shipCss({css: '.a{color:red}'})
    expect(first.bundle?.css).toBe('.a{color:red}')
    expect(second.bundle).toBeUndefined()
    expect(second.hash).toBe(first.hash)
  })

  it('ships a fresh bundle again when the css text changes', async () => {
    const shipCss = makeCssBundleDeduper()
    const first = await shipCss({css: '.a{color:red}'})
    const second = await shipCss({css: '.b{color:blue}'})
    expect(second.bundle?.css).toBe('.b{color:blue}')
    expect(second.hash).not.toBe(first.hash)
  })
})
