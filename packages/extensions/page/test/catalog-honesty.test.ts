import {describe, expect, it} from 'vitest'
import {createToolRegistry} from '@conciv/extension/registry'
import {PAGE_TOOL_DEFS, effectDef} from '../src/shared/defs.js'

function bootCatalog(opts: {connected: boolean}) {
  const registry = createToolRegistry({
    pageCaller: async () => ({ok: true}),
    isAnyPageConnected: () => opts.connected,
  })
  for (const def of PAGE_TOOL_DEFS) registry.register(def.client(), {owner: 'the page extension'})
  return registry.catalog
}

describe('the page catalog reports what the system can actually do', () => {
  it('marks every page tool as a client binding that is unreachable until a page connects', () => {
    const catalog = bootCatalog({connected: false})
    for (const entry of catalog.list()) {
      expect(entry.binding).toBe('client')
      expect(entry.reachable).toBe(false)
    }
  })

  it('flips every page tool to reachable once a page is connected', () => {
    const catalog = bootCatalog({connected: true})
    for (const entry of catalog.list()) expect(entry.reachable).toBe(true)
  })

  it('describes page.effect as the real host-effect driver, not a stub', () => {
    const signature = bootCatalog({connected: true}).get('page.effect')
    expect(signature.summary).toBe(
      'enable, disable, toggle, report or list the visual effects the host page registered',
    )
    expect(signature.mutating).toBe(true)
    expect(signature.hint).toContain('action list reports every registered effect')
  })

  it('surfaces the UNKNOWN_EFFECT declaration through the catalog signature', () => {
    const signature = bootCatalog({connected: true}).get('page.effect')
    expect(signature.errors).toContainEqual({
      code: 'UNKNOWN_EFFECT',
      message: 'no effect is registered under that name',
      transport: false,
    })
  })

  it('carries every declared error of every declaring tool into its signature', () => {
    const catalog = bootCatalog({connected: true})
    for (const def of PAGE_TOOL_DEFS) {
      const declared = Object.keys(def.errors ?? {})
      const listed = catalog.get(def.name).errors.map((error) => error.code)
      for (const code of declared) expect(listed, `${def.name} drops ${code}`).toContain(code)
    }
    expect(Object.keys(effectDef.errors ?? {})).toContain('UNKNOWN_EFFECT')
  })

  it('projects the declared label and icon for every page tool so the widget never needs a fallback', () => {
    const catalog = bootCatalog({connected: true})
    for (const entry of catalog.list()) {
      expect(entry.icon, `${entry.name} has no icon`).toBeDefined()
      expect(entry.label?.running, `${entry.name} has no running label`).toBeTruthy()
      expect(entry.label?.done, `${entry.name} has no done label`).toBeTruthy()
    }
  })
})
