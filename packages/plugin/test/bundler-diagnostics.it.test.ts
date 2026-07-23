import {afterEach, describe, expect, it} from 'vitest'
import {cp, mkdtemp, realpath, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer, type ViteDevServer} from 'vite'
import type {BundlerDiagnostic} from '@conciv/protocol/bundler-types'
import {makeViteBridge} from '../src/core/vite.js'

const FIXTURE = fileURLToPath(new URL('./fixtures/diagnostics-app', import.meta.url))

async function waitFor<T>(get: () => T | undefined, timeoutMs = 4000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = get()
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('timed out waiting for diagnostic')
}

describe('BundlerBridge diagnostic stream (IT, real vite dev server)', () => {
  const state = {server: undefined as ViteDevServer | undefined}
  afterEach(async () => {
    await state.server?.close()
    state.server = undefined
  })

  it('captures a real transform error and a real HMR file change through server.bundler.subscribe', async () => {
    const root = await realpath(await mkdtemp(join(await realpath(tmpdir()), 'conciv-diag-')))
    await cp(FIXTURE, root, {recursive: true})
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: {host: '127.0.0.1', port: 0},
    })
    state.server = server
    await server.listen()
    const address = server.httpServer?.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const base = `http://127.0.0.1:${port}`

    const ring: BundlerDiagnostic[] = []
    const bridge = makeViteBridge(server)
    const unsubscribe = bridge.subscribe?.((diagnostic) => ring.push(diagnostic))

    await fetch(`${base}/broken.ts`, {headers: {'sec-fetch-dest': 'script'}}).catch(() => undefined)
    const buildError = await waitFor(() => ring.find((diagnostic) => diagnostic.kind === 'build-error'))
    if (buildError.kind !== 'build-error') throw new Error('expected build-error diagnostic')
    expect(buildError.file).toContain('broken.ts')
    expect(buildError.message.length).toBeGreaterThan(0)
    expect(buildError.timestamp).toBeGreaterThan(0)

    await writeFile(join(root, 'good.ts'), `export const greeting = 'updated'\n`)
    const hmr = await waitFor(() => ring.find((diagnostic) => diagnostic.kind === 'hmr-update'))
    if (hmr.kind !== 'hmr-update') throw new Error('expected hmr-update diagnostic')
    expect(hmr.file).toContain('good.ts')

    const body = await fetch(`${base}/good.ts`, {headers: {'sec-fetch-dest': 'script'}}).then((r) => r.text())
    expect(body.length).toBeGreaterThan(0)
    const trace = await waitFor(() =>
      ring.find((diagnostic) => diagnostic.kind === 'request-trace' && diagnostic.url.startsWith('/good.ts')),
    )
    if (trace.kind !== 'request-trace') throw new Error('expected request-trace diagnostic')
    expect(trace.method).toBe('GET')
    expect(trace.status).toBeGreaterThan(0)
    expect(trace.durationMs).toBeGreaterThanOrEqual(0)
    expect(trace.timestamp).toBeGreaterThan(0)

    unsubscribe?.()
  })
})
