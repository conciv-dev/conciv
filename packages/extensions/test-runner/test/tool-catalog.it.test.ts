import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtempSync} from 'node:fs'
import {makeDiscoverTools, makeRunTypescript} from '@conciv/harness-testkit'
import {start, type Engine} from '@conciv/core'
import type {AnyExtension} from '@conciv/extension'
import testRunnerExtension from '../src/server.js'

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/vitest-app')

const extensions: AnyExtension[] = [testRunnerExtension]

async function boot(): Promise<{base: string; engine: Engine}> {
  const engine = await start({
    options: {systemPrompt: false, stateRoot: mkdtempSync(join(tmpdir(), 'conciv-test-runner-catalog-'))},
    root: fixture,
    launchEditor: () => {},
    extensions,
  })
  return {base: `http://127.0.0.1:${engine.port}`, engine}
}

function runSandbox(base: string, typescriptCode: string): Promise<unknown> {
  return makeRunTypescript(base, '')(typescriptCode)
}

describe('the test-runner tool rides the tool registry into the sandbox (IT)', () => {
  it('appears in discover_tools with its declared summary', async () => {
    const {base, engine} = await boot()
    try {
      const {tools} = await makeDiscoverTools(base, '')(['test_runner'])
      expect(tools.map((tool) => tool.name)).toEqual(['external_test_runner'])
      expect(tools[0]?.description).not.toBe('')
    } finally {
      await engine.stop()
    }
  }, 60_000)

  it('is callable through code-mode and round-trips a status result from the real manager', async () => {
    const {base, engine} = await boot()
    try {
      const status = z
        .object({summary: z.object({passed: z.number()}).loose(), tests: z.array(z.unknown())})
        .loose()
        .parse(await runSandbox(base, "return await external_test_runner({action: 'status'})"))
      expect(Array.isArray(status.tests)).toBe(true)
    } finally {
      await engine.stop()
    }
  }, 60_000)
})
