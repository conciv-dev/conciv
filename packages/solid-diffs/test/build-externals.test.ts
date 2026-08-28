import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const bundle = readFileSync(fileURLToPath(new URL('../dist/index.js', import.meta.url)), 'utf8')

const externalized = (specifier: string): boolean =>
  new RegExp(`from\\s*["']${specifier.replaceAll('/', '\\/')}`).test(bundle)

describe('solid-diffs build keeps its pacing runtime shared with the host', () => {
  it('externalizes @tanstack/solid-pacer so the widget ships one throttler runtime', () => {
    expect(externalized('@tanstack/solid-pacer')).toBe(true)
  })

  it('externalizes solid-js so the reactive runtime stays the host copy', () => {
    expect(externalized('solid-js')).toBe(true)
  })
})
