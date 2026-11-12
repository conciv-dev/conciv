import {readdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {Script} from 'node:vm'
import {describe, expect, it} from 'vitest'
import {createConciv, mountConciv} from '../../src/mount.js'

const widgetDistDir = fileURLToPath(new URL('../../dist/', import.meta.url))

function chunkText(file: string): string {
  return readFileSync(widgetDistDir + 'widget/' + file, 'utf8')
}

function referencedChunks(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
}

function walkChunks(roots: string[], pattern: RegExp): string[] {
  const emitted = new Set(readdirSync(widgetDistDir + 'widget'))
  const seen = new Set<string>()
  const pending = [...roots]
  while (pending.length > 0) {
    const file = pending.pop()
    if (file === undefined || seen.has(file) || !emitted.has(file)) continue
    seen.add(file)
    pending.push(...referencedChunks(chunkText(file), pattern))
  }
  return [...seen]
}

const STATIC_IMPORT = /(?:import|export)\s*(?:[\w${}\s,*]*?from\s*)?["']\.\/([^"']+\.js)["']/g
const ANY_IMPORT = /["'`]\.\/([\w.-]+\.js)["'`]/g

function loaderEntry(loader: string): string {
  return /["']widget\/([^"']+\.js)["']/.exec(readFileSync(widgetDistDir + loader, 'utf8'))?.[1] ?? ''
}

function shippedText(loader: string): string {
  return walkChunks([loaderEntry(loader)], ANY_IMPORT)
    .map(chunkText)
    .join('\n')
}

function firstLoadText(loader: string): string {
  const mountImpl = readdirSync(widgetDistDir + 'widget').filter((name) => /^mount-impl-.*\.js$/.test(name))
  return walkChunks([loaderEntry(loader), ...mountImpl], STATIC_IMPORT)
    .map(chunkText)
    .join('\n')
}

describe('mount externals', () => {
  const distDir = fileURLToPath(new URL('../../dist/', import.meta.url))
  const chunkName = readdirSync(distDir).find((name) => /^mount-impl.*\.js$/.test(name)) ?? ''
  const mount = chunkName ? readFileSync(distDir + chunkName, 'utf8') : ''
  const entry = readFileSync(distDir + 'mount.js', 'utf8')
  const globalBundle = shippedText('conciv-widget.global.js')

  const externalized = (specifier: string) => new RegExp(`from\\s*["']${specifier.replace('/', '\\/')}`).test(mount)

  describe('embed mount build pins one TanStack Query copy, the one @conciv/client bundles (#350, TanStack/query#11230)', () => {
    const solidQueryCopies = (bundle: string) => bundle.split('No QueryClient set').length - 1

    it('carries no solid-query of its own, so the app and every extension share one QueryClient context and onlineManager', () => {
      expect(solidQueryCopies(mount)).toBe(0)
      expect(externalized('@tanstack/solid-query')).toBe(false)
      expect(externalized('@tanstack/query-core')).toBe(false)
    })

    it('imports TanStack Query through @conciv/client, whose bundle carries the patched copy', () => {
      expect(externalized('@conciv/client')).toBe(true)
    })

    it('inlines exactly one solid-query copy into the self-contained global bundle', () => {
      expect(solidQueryCopies(globalBundle)).toBe(1)
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
  const nativeBundle = shippedText('conciv-widget-native.global.js')
  const widgetBundle = shippedText('conciv-widget.global.js')

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

describe('widget loaders', () => {
  const loaders = ['conciv-widget.global.js', 'conciv-widget-native.global.js']

  describe('each public bundle file is a classic-script loader over shared ESM chunks', () => {
    it.each(loaders)('%s parses as a classic script, so a plain <script src> runs it', (loader) => {
      const source = readFileSync(widgetDistDir + loader, 'utf8')
      expect(() => new Script(source)).not.toThrow()
      expect(source.length).toBeLessThan(512)
    })

    it.each(loaders)('%s resolves its entry chunk next to itself', (loader) => {
      const entry = loaderEntry(loader)
      expect(entry).not.toBe('')
      expect(chunkText(entry).length).toBeGreaterThan(0)
    })
  })

  describe('heavy optional libraries stay out of the first load', () => {
    const lazyMarkers = {
      mermaid: 'mermaidAPI',
      katex: 'KaTeX parse error',
      xterm: 'xterm-helper-textarea',
      shikiGrammars: 'source.cobol',
    }

    it.each(loaders)('%s ships mermaid, katex, xterm and shiki grammars only as lazy chunks', (loader) => {
      const firstLoad = firstLoadText(loader)
      const shipped = shippedText(loader)
      for (const marker of Object.values(lazyMarkers)) expect(firstLoad).not.toContain(marker)
      expect(shipped).toContain(lazyMarkers.mermaid)
      expect(shipped).toContain(lazyMarkers.katex)
      expect(shipped).toContain(lazyMarkers.shikiGrammars)
    })
  })
})
