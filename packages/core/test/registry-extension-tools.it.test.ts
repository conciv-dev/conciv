import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool, toolError} from '@conciv/extension'
import {makeRunTypescript, type Kit} from '@conciv/harness-testkit'
import {bootKit} from './helpers/boot.js'

const lens = defineTool({
  name: 'acme_lens',
  description: 'Inspect the acme lens assembly.',
  inputSchema: z.object({zoom: z.number().int().min(1)}),
  outputSchema: z.object({zoom: z.number(), focused: z.boolean()}),
  errors: {LENS_JAMMED: {message: 'the lens is jammed'}},
  meta: {summary: 'inspect the lens assembly', category: 'acme', mutating: false},
}).server((input) => {
  if (input.zoom > 3) throw toolError('LENS_JAMMED', {message: 'the lens is jammed'})
  return {zoom: input.zoom, focused: true}
})

const acme = defineExtension({name: 'acme', tools: [lens]})

const CatalogDetailSchema = z
  .object({name: z.string(), category: z.string(), output: z.unknown(), errors: z.array(z.unknown())})
  .loose()

const CatalogListSchema = z
  .object({tools: z.array(z.object({name: z.string(), summary: z.string(), category: z.string()}).loose())})
  .loose()

async function runSandbox(kit: Kit, typescriptCode: string): Promise<unknown> {
  const session = await kit.session()
  return makeRunTypescript(kit.base, session)(typescriptCode)
}

describe('registry-declared extension tools ride the tool registry into the sandbox', () => {
  it('appears in the catalog with its declared summary, category and output schema', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const listed = CatalogListSchema.parse(
        await runSandbox(kit, "return await external_catalog({search: 'acme_lens'})"),
      )
      const entry = listed.tools.find((tool) => tool.name === 'acme_lens')
      expect(entry?.summary).toBe('inspect the lens assembly')
      expect(entry?.category).toBe('acme')
      const detail = CatalogDetailSchema.parse(
        await runSandbox(kit, "return await external_catalog({name: 'acme_lens'})"),
      )
      expect(JSON.stringify(detail.output)).toContain('focused')
      expect(JSON.stringify(detail.errors)).toContain('LENS_JAMMED')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('is callable through the code-mode sandbox and surfaces its declared error by code', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const drawn = await runSandbox(kit, 'return await external_acme_lens({zoom: 2})')
      expect(JSON.stringify(drawn)).toContain('focused')
      const failed = await runSandbox(
        kit,
        "try { await external_acme_lens({zoom: 9}); return 'no-error' } catch (error) { return String(error) }",
      )
      expect(z.string().parse(failed)).toContain('LENS_JAMMED')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('rejects malformed input with a loud validation error, never a silent success', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const failed = await runSandbox(
        kit,
        "try { await external_acme_lens({zoom: 'way too much'}); return 'no-error' } catch (error) { return String(error) }",
      )
      expect(z.string().parse(failed)).not.toBe('no-error')
      expect(z.string().parse(failed).toLowerCase()).toMatch(/input|invalid|zoom/)
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('surfaces the capability exactly once, never through two declaration paths', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const listed = CatalogListSchema.parse(
        await runSandbox(kit, "return await external_catalog({search: 'acme_lens'})"),
      )
      expect(listed.tools.filter((tool) => tool.name === 'acme_lens')).toHaveLength(1)
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})
