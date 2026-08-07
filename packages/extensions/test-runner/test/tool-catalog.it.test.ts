import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtempSync} from 'node:fs'
import {makeRunTypescript} from '@conciv/harness-testkit'
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

const CatalogList = z.object({
  tools: z.array(
    z
      .object({call: z.string(), name: z.string(), summary: z.string(), category: z.string(), mutating: z.boolean()})
      .loose(),
  ),
})

const CatalogDetail = z.object({call: z.string(), name: z.string(), output: z.unknown()}).loose()

describe('the test-runner tool rides the tool registry into the catalog and the sandbox (IT)', () => {
  it('appears in the catalog with its declared summary, category and test-result output schema', async () => {
    const {base, engine} = await boot()
    try {
      const listed = CatalogList.parse(await runSandbox(base, "return await external_catalog({search: 'test_runner'})"))
      const entry = listed.tools.find((tool) => tool.name === 'test_runner')
      expect(entry?.summary).not.toBe('')
      expect(entry?.category).toBe('test-runner')
      expect(entry?.mutating).toBe(false)
      const detail = CatalogDetail.parse(await runSandbox(base, "return await external_catalog({name: 'test_runner'})"))
      expect(JSON.stringify(detail.output)).toContain('summary')
    } finally {
      await engine.stop()
    }
  }, 60_000)

  it('is callable through code-mode and round-trips a status result from the real manager', async () => {
    const {base, engine} = await boot()
    try {
      const answered = z
        .object({
          category: z.string(),
          status: z.object({summary: z.object({passed: z.number()}).loose(), tests: z.array(z.unknown())}).loose(),
        })
        .parse(
          await runSandbox(
            base,
            [
              "const found = await external_catalog({name: 'test_runner'})",
              "const status = await globalThis[found.call]({action: 'status'})",
              'return {category: found.category, status}',
            ].join('\n'),
          ),
        )
      expect(answered.category).toBe('test-runner')
      expect(Array.isArray(answered.status.tests)).toBe(true)
    } finally {
      await engine.stop()
    }
  }, 60_000)
})
