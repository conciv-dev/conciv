import {readdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const chunkName = readdirSync(distDir).find((name) => /^mount-impl.*\.js$/.test(name)) ?? ''
const mount = chunkName ? readFileSync(distDir + chunkName, 'utf8') : ''
const entry = readFileSync(distDir + 'mount.js', 'utf8')
const globalBundle = readFileSync(distDir + 'conciv-widget.global.js', 'utf8')

const externalized = (specifier: string) => new RegExp(`from\\s*["']${specifier.replace('/', '\\/')}`).test(mount)

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

  it('inlines the private conciv app, @conciv/page, and the built-in tool declarations it reads', () => {
    expect(externalized('@conciv/app/router')).toBe(false)
    expect(externalized('@conciv/page')).toBe(false)
    expect(externalized('@conciv/tools')).toBe(false)
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
