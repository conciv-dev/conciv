import {describe, expect, it} from 'vitest'
import ts from 'typescript'
import {TOKENS} from '@mandarax/ui-kit-system/tokens'
import {buildCatalog, scaffold, validateSource, type ScaffoldKind} from '../src/catalog.js'

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

  it('validate errors when the defineExtension default export is missing', () => {
    const res = validateSource('export const notAnExtension = 1')
    expect(res.ok).toBe(false)
    expect(res.issues.some((i) => i.level === 'error' && i.message.includes('defineExtension'))).toBe(true)
  })

  it('validate warns (but stays ok) on a known non-overridable token', () => {
    const src = `export default defineExtension({id: 'x'}).client((mx) => { mx.ui.setTheme({'pw-panel': '#000'}) })`
    const res = validateSource(src)
    expect(res.ok).toBe(true)
    expect(res.issues.some((i) => i.level === 'warn' && i.message.includes('pw-panel'))).toBe(true)
  })

  it('every scaffold kind emits source that parses as TS/TSX', () => {
    const kinds: ScaffoldKind[] = ['theme', 'composer-action', 'tool', 'tool-renderer', 'component', 'full']
    for (const kind of kinds) {
      const out = ts.transpileModule(scaffold(kind, {id: 'demo'}), {
        fileName: `${kind}.tsx`,
        reportDiagnostics: true,
        compilerOptions: {jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext},
      })
      const syntactic = (out.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error)
      expect(syntactic, `${kind} scaffold should parse`).toHaveLength(0)
    }
  })
})
