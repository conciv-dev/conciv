import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {start} from '../../src/start.js'

const BUNDLE = 'conciv-widget-native.global.js'

describe('token-scoped native page', () => {
  it('serves the native page under /t/<token> with a prefix-relative bundle, and 404s unprefixed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-native-token-'))
    const nativeDir = mkdtempSync(join(tmpdir(), 'conciv-native-dist-'))
    const endpointDir = mkdtempSync(join(tmpdir(), 'conciv-native-ep-'))
    writeFileSync(join(nativeDir, BUNDLE), 'globalThis.__conciv_native_loaded = true')
    const token = 'tok-abc123'
    const engine = await start({
      options: {harnessBin: 'true', stateRoot: root, systemPrompt: false},
      root,
      launchEditor: () => {},
      accessToken: token,
      nativePageDir: nativeDir,
      devEndpointDir: endpointDir,
    })
    try {
      const origin = `http://127.0.0.1:${engine.port}`
      const pageUrl = `${origin}/t/${token}/native`

      const page = await fetch(pageUrl)
      expect(page.status).toBe(200)
      const html = await page.text()
      const match = /<script src="([^"]+)"><\/script>/.exec(html)
      const src = match?.[1]
      expect(src).toBe(`native/${BUNDLE}`)
      if (src === undefined) throw new Error('no script src in native page')

      const resolved = new URL(src, pageUrl)
      expect(resolved.pathname).toBe(`/t/${token}/native/${BUNDLE}`)
      const script = await fetch(resolved)
      expect(script.status).toBe(200)
      expect(script.headers.get('content-type')).toContain('javascript')

      const unprefixed = await fetch(`${origin}/native`)
      expect(unprefixed.status).toBe(404)
    } finally {
      await engine.stop()
      rmSync(root, {recursive: true, force: true})
      rmSync(nativeDir, {recursive: true, force: true})
      rmSync(endpointDir, {recursive: true, force: true})
    }
  })
})
