import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtempSync} from 'node:fs'
import {makeDiscoverTools, makeRunTypescript} from '@conciv/harness-testkit'
import {start, type Engine} from '@conciv/core'
import type {AnyExtension} from '@conciv/extension'
import iosExtension from '../src/server.js'

const extensions: AnyExtension[] = [iosExtension]

async function boot(): Promise<{base: string; engine: Engine}> {
  const engine = await start({
    options: {systemPrompt: false, stateRoot: mkdtempSync(join(tmpdir(), 'conciv-ios-catalog-state-'))},
    root: mkdtempSync(join(tmpdir(), 'conciv-ios-catalog-root-')),
    launchEditor: () => {},
    extensions,
  })
  return {base: `http://127.0.0.1:${engine.port}`, engine}
}

function runSandbox(base: string, typescriptCode: string): Promise<unknown> {
  return makeRunTypescript(base, '')(typescriptCode)
}

describe('the ios tools ride the tool registry into the sandbox and the approval path (IT)', () => {
  it('offers the read tools to discover_tools and keeps the approval tools out of code mode', async () => {
    const {base, engine} = await boot()
    try {
      const discover = makeDiscoverTools(base, '')
      const read = await discover(['ios_screenshot', 'ios_logs'])
      expect(read.tools.map((tool) => tool.name)).toEqual(['external_ios_screenshot', 'external_ios_logs'])
      for (const tool of read.tools) expect(tool.description, tool.name).not.toBe('')
      const asking = await discover(['ios_build', 'ios_run'])
      expect(asking.tools).toEqual([])
      expect(asking.errors).toHaveLength(2)
    } finally {
      await engine.stop()
    }
  }, 60_000)

  it('is callable through code-mode: an unconfigured ios extension answers its declared not-configured shape', async () => {
    const {base, engine} = await boot()
    try {
      const answered = z
        .object({ok: z.literal(false), error: z.string()})
        .loose()
        .parse(await runSandbox(base, 'return await external_ios_logs({})'))
      expect(answered.error).toContain('not configured')
    } finally {
      await engine.stop()
    }
  }, 60_000)
})
