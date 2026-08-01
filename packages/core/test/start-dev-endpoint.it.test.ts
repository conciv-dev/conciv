import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {readDevEndpoint} from '../src/lib/dev-endpoint.js'
import {start, type Engine} from '../src/start.js'

type EngineCase = {
  accessToken?: string
  serveNativePage?: boolean
}

async function withStartedEngine(
  engineCase: EngineCase,
  assertEndpoint: (engine: Engine, endpointDir: string) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'conciv-start-endpoint-'))
  const endpointDir = mkdtempSync(join(tmpdir(), 'conciv-endpoint-dir-'))
  try {
    const engine = await start({
      options: {harnessBin: 'true', stateRoot: root, systemPrompt: false},
      root,
      launchEditor: () => {},
      accessToken: engineCase.accessToken,
      nativePageDir: engineCase.serveNativePage ? root : undefined,
      devEndpointDir: endpointDir,
    })
    await assertEndpoint(engine, endpointDir)
  } finally {
    rmSync(root, {recursive: true, force: true})
    rmSync(endpointDir, {recursive: true, force: true})
  }
}

describe('start pairing file', () => {
  it('writes the endpoint on boot when a native page is served and removes it on stop', async () => {
    await withStartedEngine({accessToken: 'paired-token', serveNativePage: true}, async (engine, endpointDir) => {
      const endpoint = readDevEndpoint(endpointDir)
      expect(endpoint).toEqual({
        apiBase: `http://127.0.0.1:${engine.port}/t/paired-token`,
        token: 'paired-token',
        pid: process.pid,
      })
      await engine.stop()
      expect(readDevEndpoint(endpointDir)).toBeNull()
    })
  })

  it('serves /native and writes a tokenless endpoint with no ios config (the zero-config widget path)', async () => {
    await withStartedEngine({serveNativePage: true}, async (engine, endpointDir) => {
      const page = await fetch(`http://127.0.0.1:${engine.port}/native`)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('data-conciv-native-root')

      expect(readDevEndpoint(endpointDir)).toEqual({
        apiBase: `http://127.0.0.1:${engine.port}`,
        token: null,
        pid: process.pid,
      })
      await engine.stop()
      expect(readDevEndpoint(endpointDir)).toBeNull()
    })
  })

  it('does not write the endpoint when no native page is served', async () => {
    await withStartedEngine({}, async (engine, endpointDir) => {
      expect(readDevEndpoint(endpointDir)).toBeNull()
      await engine.stop()
    })
  })
})
