import {afterEach, describe, expect, it} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer, type ViteDevServer} from 'vite'
import {makeViteHook} from '../src/core/vite.js'

const NATIVE_BUNDLE = 'conciv-widget-native.global.js'

async function enginePort(server: ViteDevServer): Promise<number> {
  const html = await server.transformIndexHtml('/native', '<!doctype html><html><head></head><body></body></html>')
  const apiBase = html.match(/name="pw-api-base"[^>]*content="([^"]+)"/)?.[1]
  const port = apiBase ? Number(new URL(apiBase).port) : NaN
  if (!Number.isInteger(port)) throw new Error(`no engine port injected, got ${apiBase ?? html}`)
  return port
}

describe('dev core booted through the vite plugin', () => {
  const state: {server: ViteDevServer | undefined; dirs: string[]} = {server: undefined, dirs: []}

  afterEach(async () => {
    await state.server?.close()
    state.server = undefined
    await new Promise((resolve) => setTimeout(resolve, 300))
    for (const dir of state.dirs) rmSync(dir, {recursive: true, force: true})
    state.dirs = []
  })

  it('serves /native because configureServer threads the native page dir into the engine', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-vite-root-'))
    const nativeDir = mkdtempSync(join(tmpdir(), 'conciv-vite-native-'))
    state.dirs = [root, nativeDir]
    writeFileSync(join(nativeDir, NATIVE_BUNDLE), 'globalThis.__conciv_native_loaded = true')

    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: {host: '127.0.0.1', port: 0},
      plugins: [
        makeViteHook(
          {enabled: true, stateRoot: root, widget: false},
          {serverExtensions: [], clientEntries: [], nativePageDir: nativeDir},
        ),
      ],
    })
    state.server = server
    await server.listen()

    const port = await enginePort(server)
    const page = await fetch(`http://127.0.0.1:${port}/native`)
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('data-conciv-native-root')
    expect(html).toContain(`native/${NATIVE_BUNDLE}`)
  }, 30_000)
})
