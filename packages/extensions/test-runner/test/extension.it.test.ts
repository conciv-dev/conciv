import {describe, it, expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtempSync} from 'node:fs'
import {createMCPClient} from '@tanstack/ai-mcp'
import {start, type Engine} from '@conciv/core'
import type {ConcivConfig} from '@conciv/core/config'
import {makeExtRpcClient, type AnyExtension} from '@conciv/extension'
import testRunnerExtension, {type TestRunnerRouter} from '../src/server.js'

declare module '@conciv/protocol/config-types' {
  interface ExtensionConfigRegistry {
    'test-runner': {runner?: 'vitest' | 'jest' | 'node-test' | 'playwright'}
  }
}

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/vitest-app')

function runnerClient(base: string) {
  return makeExtRpcClient<TestRunnerRouter>(base, 'test-runner')
}

const extensions: AnyExtension[] = [testRunnerExtension]

async function boot(opts: {root?: string; extensions?: ConcivConfig['extensions']} = {}): Promise<{
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
  it('serves a TestRunResult shape on status under the default vitest config', async () => {
    const {base, engine} = await boot()
    try {
      const status = await runnerClient(base).status(undefined)
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
      await mcp.callTool('conciv_discover_tools', {names: ['test_runner']})
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

  it('emits a snapshot event on stream open', async () => {
    const {base, engine} = await boot()
    try {
      const abort = new AbortController()
      const stream = await runnerClient(base).stream(undefined, {signal: abort.signal})
      const first = await stream.next()
      if (first.done) throw new Error('stream ended before the snapshot')
      expect(first.value.type).toBe('snapshot')
      abort.abort()
      await stream.return(undefined).catch(() => {})
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('skips a misconfigured runner (runner=jest stub) without aborting boot', async () => {
    const {base, engine} = await boot({extensions: {'test-runner': {runner: 'jest'}}})
    try {
      await expect(runnerClient(base).status(undefined)).rejects.toThrow()
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('rejects a non-loopback Origin on an extension rpc route with 403', async () => {
    const {base, engine} = await boot()
    try {
      const forbidden = await fetch(`${base}/rpc/ext/test-runner/status`, {
        method: 'POST',
        headers: {origin: 'http://evil.com', 'content-type': 'application/json'},
        body: '{}',
      })
      expect(forbidden.status).toBe(403)
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('maps a runner-unavailable failure to a typed UNAVAILABLE error on run', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-it-state-'))
    const missingRoot = join(mkdtempSync(join(tmpdir(), 'conciv-it-root-')), 'absent')
    const engine = await start({
      options: {systemPrompt: false, stateRoot},
      root: missingRoot,
      launchEditor: () => {},
      extensions,
    })
    const base = `http://127.0.0.1:${engine.port}`
    try {
      await expect(runnerClient(base).run({})).rejects.toMatchObject({
        code: 'UNAVAILABLE',
        data: {available: false},
      })
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('runs the extension disposer (manager.stop) when the engine stops', async () => {
    const {base, engine} = await boot()
    await expect(engine.stop()).resolves.toBeUndefined()
    await expect(runnerClient(base).status(undefined)).rejects.toThrow()
  }, 30_000)
})
