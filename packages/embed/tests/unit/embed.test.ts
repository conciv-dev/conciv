import {readdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import {createConciv, mountConciv} from '../../src/mount.js'

describe('mount externals', () => {
  const distDir = fileURLToPath(new URL('../../dist/', import.meta.url))
  const chunkName = readdirSync(distDir).find((name) => /^mount-impl.*\.js$/.test(name)) ?? ''
  const mount = chunkName ? readFileSync(distDir + chunkName, 'utf8') : ''
  const entry = readFileSync(distDir + 'mount.js', 'utf8')
  const globalBundle = readFileSync(distDir + 'conciv-widget.global.js', 'utf8')

  const externalized = (specifier: string) => new RegExp(`from\\s*["']${specifier.replace('/', '\\/')}`).test(mount)

  describe('embed mount build pins the onlineManager singleton topology (#350)', () => {
    it('never externalizes @tanstack/query-core, so the mounted app shares one onlineManager with its own QueryClient', () => {
      expect(externalized('@tanstack/query-core')).toBe(false)
    })

    it('never inlines @conciv/contract, so its reachability seam cannot capture a second query-core instance', () => {
      expect(externalized('@conciv/contract')).toBe(true)
    })
  })

  describe('embed mount build shares one Ark environment instance with extensions', () => {
    it('externalizes ui-kit-system so the root EnvironmentProvider and extension Combobox read the same context', () => {
      expect(externalized('@conciv/ui-kit-system')).toBe(true)
    })

    it('externalizes ui-kit-chat so the model selector context is shared', () => {
      expect(externalized('@conciv/ui-kit-chat')).toBe(true)
    })

    it('externalizes ui-kit-tap so extensions share one editor and Solid/Ark copy', () => {
      expect(externalized('@conciv/ui-kit-tap')).toBe(true)
    })

    it('externalizes @ark-ui rather than bundling a second copy', () => {
      expect(externalized('@ark-ui/')).toBe(true)
    })

    it('externalizes solid-js so extension clients share the reactive runtime', () => {
      expect(externalized('solid-js')).toBe(true)
    })

    it('inlines the private conciv app, @conciv/page, and the packages whose cards it renders', () => {
      expect(externalized('@conciv/app/router')).toBe(false)
      expect(externalized('@conciv/page')).toBe(false)
      expect(externalized('@conciv/tools')).toBe(false)
      expect(externalized('@conciv/core')).toBe(false)
    })

    it('ships only the page declarations, never the dev-server ones the widget cannot call', () => {
      expect(globalBundle).toContain('type a value into a form field')
      expect(globalBundle).not.toContain('restart the dev server')
    })

    it('emits the app graph as a mount-impl chunk', () => {
      expect(chunkName).not.toBe('')
    })

    it('keeps the mount entry free of static runtime imports (SSR-safe)', () => {
      expect(/^import\s/m.test(entry)).toBe(false)
    })
  })
})

describe('mount node', () => {
  describe('createConciv outside a browser', () => {
    it('unmount before mount is a no-op', () => {
      expect(() => createConciv().unmount()).not.toThrow()
    })

    it('mountConciv is safe to call without document', () => {
      expect(() => mountConciv([])).not.toThrow()
    })
  })
})

describe('native bundle', () => {
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
})
