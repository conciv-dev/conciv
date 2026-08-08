import {afterEach, describe, expect, it} from 'vitest'
import {existsSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {devServers, pageApiBase} from './helpers/dev-servers.js'

const NATIVE_BUNDLE = 'conciv-widget-native.global.js'

describe('dev core booted through the vite plugin', () => {
  const servers = devServers()

  afterEach(() => servers.stopAll())

  it('serves /native because configureServer threads the native page dir into the engine', async () => {
    const nativeDir = servers.tempDir('conciv-vite-native-')
    const endpointDir = servers.tempDir('conciv-vite-endpoint-')
    writeFileSync(join(nativeDir, NATIVE_BUNDLE), 'globalThis.__conciv_native_loaded = true')

    const {server} = await servers.start(
      {widget: false, devEndpointDir: endpointDir},
      {
        serverExtensions: [],
        clientEntries: [],
        nativePageDir: nativeDir,
      },
    )

    const apiBase = await pageApiBase(server, '/native')
    const page = await fetch(`${apiBase}/native`)
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('data-conciv-native-root')
    expect(html).toContain(`native/${NATIVE_BUNDLE}`)
    expect(existsSync(join(endpointDir, 'dev-endpoint.json'))).toBe(true)
  }, 30_000)
})
