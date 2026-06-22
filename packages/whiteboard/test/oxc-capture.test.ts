import {mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {captureSource, hashAt} from '../src/anchor/oxc-capture.js'

const loc = (source: string, token: string): {line: number; column: number} => {
  const idx = source.indexOf(token)
  const before = source.slice(0, idx)
  return {line: before.split('\n').length, column: idx - before.lastIndexOf('\n')}
}

const SRC = 'function App() {\n  return (\n    <Foo a="x">\n      <Bar id="y" />\n    </Foo>\n  )\n}\n'

describe('hashAt', () => {
  it('hashes the JSX subtree at a location and names the enclosing component', () => {
    const {line, column} = loc(SRC, '<Bar')
    const r = hashAt(SRC, line, column)
    expect(r.hash).toMatch(/^[0-9a-f]{8}$/)
    expect(r.component).toBe('App')
    expect(r.snippet).toContain('<Bar')
  })

  it('is stable across whitespace edits but changes on a structural edit', () => {
    const base = hashAt(SRC, loc(SRC, '<Bar').line, loc(SRC, '<Bar').column)
    const reindented = SRC.replace('      <Bar id="y" />', '         <Bar    id="y"   />')
    const ws = hashAt(reindented, loc(reindented, '<Bar').line, loc(reindented, '<Bar').column)
    expect(ws.hash).toBe(base.hash)
    const structural = SRC.replace('<Bar id="y" />', '<Bar id="y"><Baz/></Bar>')
    const changed = hashAt(structural, loc(structural, '<Bar').line, loc(structural, '<Bar').column)
    expect(changed.hash).not.toBe(base.hash)
  })

  it('salts by ancestor chain so the same node under a different parent differs', () => {
    const underFoo = hashAt(SRC, loc(SRC, '<Bar').line, loc(SRC, '<Bar').column)
    const bazSrc = SRC.replace('<Foo a="x">', '<Baz a="x">').replace('</Foo>', '</Baz>')
    const underBaz = hashAt(bazSrc, loc(bazSrc, '<Bar').line, loc(bazSrc, '<Bar').column)
    expect(underBaz.hash).toBe(underFoo.hash)
    expect(underBaz.salt).not.toBe(underFoo.salt)
  })
})

describe('captureSource', () => {
  const state: {root: string} = {root: ''}
  beforeAll(() => {
    state.root = realpathSync(mkdtempSync(join(tmpdir(), 'mx-oxc-')))
    mkdirSync(join(state.root, 'src'))
    writeFileSync(join(state.root, 'src', 'Comp.tsx'), SRC)
    writeFileSync(join(state.root, '.env'), 'SECRET=AKIAIOSFODNN7EXAMPLE\n')
  })
  afterAll(() => rmSync(state.root, {recursive: true, force: true}))

  it('captures a SourceAnchor from a confined file', async () => {
    const {line, column} = loc(SRC, '<Bar')
    const anchor = await captureSource({root: state.root, file: 'src/Comp.tsx', line, column, commit: 'abc123'})
    expect(anchor).toMatchObject({file: 'src/Comp.tsx', line, column, component: 'App', commit: 'abc123'})
    expect(anchor.hash).toMatch(/^[0-9a-f]{8}$/)
    expect(anchor.snippet).toContain('<Bar')
  })

  it('never captures a snippet from a secret file', async () => {
    const anchor = await captureSource({root: state.root, file: '.env', line: 1, column: 1, commit: null})
    expect(anchor.snippet).toBe('')
  })
})
