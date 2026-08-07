import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtempSync} from 'node:fs'
import {makeRunTypescript} from '@conciv/harness-testkit'
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

const CatalogList = z.object({
  tools: z.array(
    z
      .object({
        call: z.string(),
        name: z.string(),
        summary: z.string(),
        category: z.string(),
        mutating: z.boolean(),
        approval: z.literal('ask').optional(),
      })
      .loose(),
  ),
})

const CatalogDetail = z
  .object({call: z.string(), name: z.string(), output: z.unknown(), errors: z.array(z.unknown())})
  .loose()

const DECLARED: Record<string, {mutating: boolean; approval: 'ask' | undefined}> = {
  'ios.build': {mutating: true, approval: 'ask'},
  'ios.run': {mutating: true, approval: 'ask'},
  'ios.screenshot': {mutating: false, approval: undefined},
  'ios.logs': {mutating: false, approval: undefined},
}

describe('the ios tools ride the tool registry into the catalog and the sandbox (IT)', () => {
  it('lists all four declarations under the ios category with honest mutating and approval flags', async () => {
    const {base, engine} = await boot()
    try {
      const listed = CatalogList.parse(await runSandbox(base, "return await external_catalog({search: 'ios'})"))
      const iosTools = listed.tools.filter((tool) => tool.category === 'ios')
      expect(new Set(iosTools.map((tool) => tool.name))).toEqual(new Set(Object.keys(DECLARED)))
      for (const [name, expected] of Object.entries(DECLARED)) {
        const entry = iosTools.find((tool) => tool.name === name)
        expect(entry?.mutating, name).toBe(expected.mutating)
        expect(entry?.approval, name).toBe(expected.approval)
        expect(entry?.summary, name).not.toBe('')
      }
    } finally {
      await engine.stop()
    }
  }, 60_000)

  it('carries an image-shaped output schema for ios.screenshot and a diagnostics-shaped one for ios.build', async () => {
    const {base, engine} = await boot()
    try {
      const screenshot = CatalogDetail.parse(
        await runSandbox(base, "return await external_catalog({name: 'ios.screenshot'})"),
      )
      expect(JSON.stringify(screenshot.output)).toContain('image')
      const build = CatalogDetail.parse(await runSandbox(base, "return await external_catalog({name: 'ios.build'})"))
      expect(JSON.stringify(build.output)).toContain('diagnostics')
    } finally {
      await engine.stop()
    }
  }, 60_000)

  it('is callable through code-mode: an unconfigured ios extension answers its declared not-configured shape', async () => {
    const {base, engine} = await boot()
    try {
      const answered = z
        .object({category: z.string(), answer: z.object({ok: z.literal(false), error: z.string()}).loose()})
        .parse(
          await runSandbox(
            base,
            [
              "const found = await external_catalog({name: 'ios.logs'})",
              'const answer = await globalThis[found.call]({})',
              'return {category: found.category, answer}',
            ].join('\n'),
          ),
        )
      expect(answered.category).toBe('ios')
      expect(answered.answer.error).toContain('not configured')
    } finally {
      await engine.stop()
    }
  }, 60_000)
})
