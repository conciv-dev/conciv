import {describe, expect, it} from 'vitest'
import ts from 'typescript'
import {TOKENS} from '@conciv/ui-kit-system/tokens'
import {buildCatalog, scaffold, validateSource, type ScaffoldKind} from '../src/catalog.js'

describe('extension catalog (new contract projection)', () => {
  it('projects every token into the catalog', () => {
    const cat = buildCatalog()
    const names = cat.tokens.map((t) => t.name)
    for (const name of Object.keys(TOKENS)) expect(names).toContain(name)
    expect(cat.tokens.find((t) => t.name === 'pw-accent')?.overridable).toBe(true)
  })

  it('lists the six extension slots', () => {
    const slots = buildCatalog().slots.map((s) => s.name)
    for (const name of ['header', 'footer', 'composer', 'empty', 'status', 'widget']) expect(slots).toContain(name)
  })

  it('teaches the new entry convention (defineExtension({name}) with .client/.server)', () => {
    const {entry} = buildCatalog().conventions
    expect(entry).toContain('defineExtension({name')
    expect(entry).toContain('.client(')
    expect(entry).toContain('.server(')
  })

  it('scaffolds a theme extension that names defineExtension, name and the theme field', () => {
    const src = scaffold('theme', {name: 'mybrand'})
    expect(src).toContain('defineExtension')
    expect(src).toContain("name: 'mybrand'")
    expect(src).toContain('theme')
  })

  it('scaffolds a full extension on the new contract surfaces', () => {
    const src = scaffold('full', {name: 'demo'})
    expect(src).toContain('defineExtension({name:')
    expect(src).toContain('.client(')
    expect(src).toContain('.server(')
    expect(src).toContain('useSlot')
  })

  it('never emits the internal __ properties in a scaffold', () => {
    for (const kind of ['theme', 'composer-action', 'tool', 'tool-renderer', 'component', 'full'] as ScaffoldKind[]) {
      const src = scaffold(kind, {name: 'demo'})
      expect(src).not.toContain('__client')
      expect(src).not.toContain('__server')
      expect(src).not.toContain('__execute')
      expect(src).not.toContain('__render')
    }
  })

  it('validate flags an unknown theme token name', () => {
    const bad = `import {defineExtension} from '@conciv/extension'
export default defineExtension({name: 'x', theme: {'pw-not-real': 'red'}})`
    const res = validateSource(bad)
    expect(res.ok).toBe(false)
    expect(res.issues.some((i) => i.message.includes('pw-not-real'))).toBe(true)
  })

  it('validate passes a well-formed theme extension', () => {
    const good = `import {defineExtension} from '@conciv/extension'
export default defineExtension({name: 'x', theme: {'pw-accent': 'blue'}})`
    expect(validateSource(good).ok).toBe(true)
  })

  it('validate errors when the defineExtension default export is missing', () => {
    const res = validateSource('export const notAnExtension = 1')
    expect(res.ok).toBe(false)
    expect(res.issues.some((i) => i.level === 'error' && i.message.includes('defineExtension'))).toBe(true)
  })

  it('validate warns (but stays ok) on a known non-overridable token', () => {
    const src = `export default defineExtension({name: 'x', theme: {'pw-panel': '#000'}})`
    const res = validateSource(src)
    expect(res.ok).toBe(true)
    expect(res.issues.some((i) => i.level === 'warn' && i.message.includes('pw-panel'))).toBe(true)
  })

  it('validate warns on a top-level node import with no .server() half', () => {
    const src = `import {readFile} from 'node:fs/promises'
export default defineExtension({name: 'x'})`
    const res = validateSource(src)
    expect(res.issues.some((i) => i.message.includes('node:'))).toBe(true)
  })

  it('every scaffold kind emits source that parses as TS/TSX', () => {
    const kinds: ScaffoldKind[] = ['theme', 'composer-action', 'tool', 'tool-renderer', 'component', 'full']
    for (const kind of kinds) {
      const out = ts.transpileModule(scaffold(kind, {name: 'demo'}), {
        fileName: `${kind}.tsx`,
        reportDiagnostics: true,
        compilerOptions: {jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext},
      })
      const syntactic = (out.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error)
      expect(syntactic, `${kind} scaffold should parse`).toHaveLength(0)
    }
  })
})
