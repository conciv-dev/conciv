import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const distDir = fileURLToPath(new URL('../../dist/', import.meta.url))
const nativeBundle = readFileSync(distDir + 'conciv-widget-native.global.js', 'utf8')
const widgetBundle = readFileSync(distDir + 'conciv-widget.global.js', 'utf8')

const importsExternally = (specifier: string) =>
  new RegExp(`from\\s*["']${specifier.replace('/', '\\/')}`).test(nativeBundle)

const occurrences = (bundle: string, marker: string) => bundle.split(marker).length - 1

describe('embed native bundle', () => {
  it('inlines the ios extension client so the WebView carries the native bridge', () => {
    expect(nativeBundle.includes('concivBridge')).toBe(true)
    expect(nativeBundle.includes('__concivNative')).toBe(true)
  })

  it('bundles the conciv app graph into the native entry', () => {
    expect(nativeBundle.includes('conciv chat agent')).toBe(true)
  })

  it('leaves no runtime import external in the self-contained native bundle', () => {
    expect(importsExternally('solid-js')).toBe(false)
    expect(importsExternally('@ark-ui/')).toBe(false)
    expect(importsExternally('@conciv/ui-kit-system')).toBe(false)
  })

  it('inlines the ios client without adding a second Solid runtime copy beyond the audited widget bundle', () => {
    const nativeProxy = occurrences(nativeBundle, 'solid-proxy')
    const nativeTrack = occurrences(nativeBundle, 'solid-track')
    expect(nativeProxy).toBeGreaterThan(0)
    expect(nativeTrack).toBeGreaterThan(0)
    expect(nativeProxy).toBe(occurrences(widgetBundle, 'solid-proxy'))
    expect(nativeTrack).toBe(occurrences(widgetBundle, 'solid-track'))
  })
})
