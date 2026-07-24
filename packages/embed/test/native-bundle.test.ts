import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const bundle = readFileSync(distDir + 'conciv-widget-native.global.js', 'utf8')

const importsExternally = (specifier: string) => new RegExp(`from\\s*["']${specifier.replace('/', '\\/')}`).test(bundle)

describe('embed native bundle', () => {
  it('inlines the ios extension client so the WebView carries the native bridge', () => {
    expect(bundle.includes('concivBridge')).toBe(true)
    expect(bundle.includes('__concivNative')).toBe(true)
  })

  it('bundles the conciv app graph into the native entry', () => {
    expect(bundle.includes('conciv:open-panel')).toBe(true)
  })

  it('is a single self-contained bundle with exactly one Solid and Ark runtime (no external imports)', () => {
    expect(importsExternally('solid-js')).toBe(false)
    expect(importsExternally('@ark-ui/')).toBe(false)
    expect(importsExternally('@conciv/ui-kit-system')).toBe(false)
  })
})
