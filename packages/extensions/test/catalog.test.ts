import {describe, expect, it} from 'vitest'
import {TOKENS} from '@mandarax/ui-kit-system/tokens'
import {buildCatalog, scaffold, validateSource} from '../src/catalog.js'

describe('extension catalog (pure projection)', () => {
  it('projects every token into the catalog', () => {
    const cat = buildCatalog()
    const names = cat.tokens.map((t) => t.name)
    for (const name of Object.keys(TOKENS)) expect(names).toContain(name)
    expect(cat.tokens.find((t) => t.name === 'pw-accent')?.overridable).toBe(true)
  })

  it('lists the overridable EmptyState component', () => {
    expect(buildCatalog().overridableComponents.map((c) => c.id)).toContain('EmptyState')
  })

  it('scaffolds a theme extension that names defineExtension and setTheme', () => {
    const src = scaffold('theme', {id: 'mybrand'})
    expect(src).toContain('defineExtension')
    expect(src).toContain("id: 'mybrand'")
    expect(src).toContain('setTheme')
  })

  it('validate flags an unknown token name', () => {
    const bad = `import {defineExtension} from '@mandarax/extensions'
export default defineExtension({id: 'x'}).client((mx) => { mx.ui.setTheme({'pw-not-real': 'red'}) })`
    const res = validateSource(bad)
    expect(res.ok).toBe(false)
    expect(res.issues.some((i) => i.message.includes('pw-not-real'))).toBe(true)
  })

  it('validate passes a well-formed theme extension', () => {
    const good = `import {defineExtension} from '@mandarax/extensions'
export default defineExtension({id: 'x'}).client((mx) => { mx.ui.setTheme({'pw-accent': 'blue'}) })`
    expect(validateSource(good).ok).toBe(true)
  })
})
