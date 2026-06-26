import {describe, it, expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtempSync} from 'node:fs'
import {createMCPClient} from '@tanstack/ai-mcp'
import {start, type Engine} from '@mandarax/core'
import type {MandaraxConfig} from '@mandarax/core/config'
import type {AnyExtension} from '@mandarax/extension'
import testRunnerExtension from '../src/server.js'

// Server-composition IT: boots the REAL engine (the public start() the CLI/plugin use) with the
// test-runner extension over a real srvx server. The extension's .server() owns
// /api/ext/test-runner/* and registers the test_runner tool on /api/mcp. Real subprocess execution
// + live event streaming are covered by vitest.it.test.ts; here we prove the server wiring: routes,
// MCP registration, config selection, CORS, 422 mapping, dispose.

// Test-side typing for this extension's per-extension config (the registry is declaration-merged).
declare module '@mandarax/protocol/config-types' {
  interface ExtensionConfigRegistry {
    'test-runner': {runner?: 'vitest' | 'jest' | 'node-test' | 'playwright'}
  }
}

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/vitest-app')
const route = '/api/ext/test-runner'

// Widen to AnyExtension[] up front, exactly as the plugin does for its built-ins.
const extensions: AnyExtension[] = [testRunnerExtension]

async function boot(opts: {root?: string; extensions?: MandaraxConfig['extensions']} = {}): Promise<{
  base: string
  engine: Engine
}> {
  const engine = await start({
    options: {systemPrompt: false, extensions: opts.extensions},
    root: opts.root ?? fixture,
    launchEditor: () => {},
    extensions,
  })
  return {base: `http://127.0.0.1:${engine.port}`, engine}
}

describe('test-runner extension booted in the real engine (IT)', () => {
  it('serves a TestRunResult shape on /status under the default vitest config', async () => {
    const {base, engine} = await boot()
    try {
      const status = (await (await fetch(`${base}${route}/status`)).json()) as {
        summary: {passed: number; failed: number; skipped: number; durationMs: number}
        failures: unknown[]
        tests: unknown[]
      }
      expect(typeof status.summary.passed).toBe('number')
      expect(typeof status.summary.failed).toBe('number')
      expect(typeof status.summary.skipped).toBe('number')
      expect(typeof status.summary.durationMs).toBe('number')
      expect(Array.isArray(status.failures)).toBe(true)
      expect(Array.isArray(status.tests)).toBe(true)
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('registers test_runner on /api/mcp and round-trips to the injected manager', async () => {
    const {base, engine} = await boot()
    try {
      const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
      const tool = (await mcp.tools()).find((candidate) => candidate.name === 'test_runner')
      if (!tool?.execute) throw new Error('test_runner not registered')

      const status = JSON.parse(String(await tool.execute({action: 'status'}))) as {
        summary: {passed: number}
        tests: unknown[]
      }
      expect(typeof status.summary.passed).toBe('number')
      expect(Array.isArray(status.tests)).toBe(true)

      await mcp.close()
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('emits a snapshot frame on /stream open', async () => {
    const {base, engine} = await boot()
    try {
      const stream = await fetch(`${base}${route}/stream`)
      const reader = stream.body!.getReader()
      const frame = new TextDecoder().decode((await reader.read()).value)
      expect(frame).toContain('snapshot')
      await reader.cancel()
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('selects the configured runner: runner=jest (a stub) is rejected at mount', async () => {
    await expect(boot({extensions: {'test-runner': {runner: 'jest'}}})).rejects.toThrow(/jest runner not implemented/)
  }, 30_000)

  it('rejects a non-loopback Origin on an extension route with 403', async () => {
    const {base, engine} = await boot()
    try {
      const forbidden = await fetch(`${base}${route}/status`, {headers: {origin: 'http://evil.com'}})
      expect(forbidden.status).toBe(403)
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('maps a runner-unavailable failure to HTTP 422 on /run', async () => {
    // A real run whose child can't spawn (cwd does not exist) surfaces as runner-unavailable. The
    // state root is a real temp dir so the engine's own writes succeed; only the runner cwd is gone.
    const stateRoot = mkdtempSync(join(tmpdir(), 'mandarax-it-state-'))
    const missingRoot = join(mkdtempSync(join(tmpdir(), 'mandarax-it-root-')), 'absent')
    const engine = await start({
      options: {systemPrompt: false, stateRoot},
      root: missingRoot,
      launchEditor: () => {},
      extensions,
    })
    const base = `http://127.0.0.1:${engine.port}`
    try {
      const res = await fetch(`${base}${route}/run`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(422)
      expect(((await res.json()) as {available: boolean}).available).toBe(false)
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('runs the extension disposer (manager.stop) when the engine stops', async () => {
    const {base, engine} = await boot()
    await expect(engine.stop()).resolves.toBeUndefined()
    await expect(fetch(`${base}${route}/status`)).rejects.toThrow()
  }, 30_000)
})
