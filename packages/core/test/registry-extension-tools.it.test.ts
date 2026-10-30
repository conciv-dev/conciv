import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool, toolError} from '@conciv/extension'
import {makeRunTypescript, type Kit} from '@conciv/harness-testkit'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {bootKit} from './helpers/boot.js'
import {connectMcpClient} from './helpers/mcp-client.js'

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

const halfDeclared = defineTool({
  name: 'acme_dial',
  description: 'Turn the acme dial without declaring meta or an output schema.',
  inputSchema: z.object({turns: z.number().int()}),
}).server((input) => ({turns: input.turns}))

const legacy = defineExtension({name: 'legacy-acme', tools: [halfDeclared]})

async function discover(kit: Kit, name: string): Promise<unknown> {
  const client = await connectMcpClient(`${kit.base}/api/mcp`, {[CONCIV_SESSION_HEADER]: await kit.session()})
  try {
    const tool = (await client.tools()).find((entry) => entry.name === 'discover_tools')
    if (tool === undefined) throw new Error('discover_tools is not on /api/mcp')
    return await tool.execute({toolNames: [name]})
  } finally {
    await client.close()
  }
}

async function runSandbox(kit: Kit, typescriptCode: string): Promise<unknown> {
  const session = await kit.session()
  return makeRunTypescript(kit.base, session)(typescriptCode)
}

describe('registry-declared extension tools ride the tool registry into the sandbox', () => {
  it('appears in discover_tools with its declared summary and input', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const found = JSON.stringify(await discover(kit, 'acme_lens'))
      expect(found).toContain('inspect the lens assembly')
      expect(found).toContain('zoom')
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
      const found = JSON.stringify(await discover(kit, 'acme_lens'))
      expect(found.split('external_acme_lens(').length - 1).toBe(1)
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('refuses to boot a tool declared without meta and an output schema instead of forwarding it', async () => {
    await expect(bootKit({extensions: [acme, legacy]})).rejects.toThrow(/acme_dial/)
  }, 30_000)
})
