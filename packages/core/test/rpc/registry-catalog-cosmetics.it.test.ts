import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {ToolCommandSignatureSchema} from '@conciv/contract'
import {bootKit} from '../helpers/boot.js'

const beacon = defineTool({
  name: 'acme_beacon',
  description: 'Raise the acme beacon over the page.',
  inputSchema: z.object({height: z.number().int().min(1)}),
  outputSchema: z.object({raised: z.boolean()}),
  meta: {
    summary: 'raise the acme beacon',
    category: 'acme',
    icon: 'pointer',
    label: {running: 'Raising the beacon', done: 'Raised the beacon'},
    mutating: true,
    mirrors: true,
  },
}).server(() => ({raised: true}))

const acme = defineExtension({name: 'acme-beacon', tools: [beacon]})

const CatalogSchema = z.array(ToolCommandSignatureSchema)

describe('the rpc catalog carries the card cosmetics a widget needs', () => {
  it('projects icon, label, mutating and mirrors across the wire', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const catalog = await kit.rpc.registry.catalog(undefined)
      const entry = catalog.find((signature) => signature.name === 'acme_beacon')
      expect(entry).toMatchObject({
        icon: 'pointer',
        label: {running: 'Raising the beacon', done: 'Raised the beacon'},
        mutating: true,
        mirrors: true,
      })
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('survives the schema the CLI parses the catalog with', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const parsed = CatalogSchema.parse(await kit.rpc.registry.catalog(undefined))
      const declared = parsed.find((signature) => signature.name === 'page.click')
      expect(declared?.icon).toBe('pointer')
      expect(declared?.label?.done).toBe('Clicked')
      expect(declared?.mirrors).toBe(true)
      expect(parsed.find((signature) => signature.name === 'acme_beacon')?.label?.running).toBe('Raising the beacon')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('keeps the whole catalog usable when a newer server sends cosmetics this build cannot read', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const live = await kit.rpc.registry.catalog(undefined)
      const fromNewerServer = live.map((signature) => ({...signature, icon: 'hologram', label: 'Clicked it'}))

      const parsed = CatalogSchema.parse(fromNewerServer)

      expect(parsed).toHaveLength(live.length)
      const declared = parsed.find((signature) => signature.name === 'page.click')
      expect(declared?.icon).toBeUndefined()
      expect(declared?.label).toBeUndefined()
      expect(declared?.summary).toBe('click an element')
      expect(declared?.mutating).toBe(true)
      expect(declared?.mirrors).toBe(true)
      expect(parsed.find((signature) => signature.name === 'acme_beacon')?.summary).toBe('raise the acme beacon')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})
