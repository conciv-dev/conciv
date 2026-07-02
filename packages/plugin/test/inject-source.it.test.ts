import {describe, it, expect} from 'vitest'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import type {Plugin} from 'vite'
import {addSourceToJsx} from '../src/core/inject-source.js'
import {makeViteHook} from '../src/core/vite.js'

const ROOT = '/proj'

const sourceValues = (code: string): string[] =>
  [...code.matchAll(/data-conciv-source="([^"]+)"/g)].map((m) => m[1] ?? '')

function transformViaHook(peerPlugins: {name: string}[]): {code: string} | null {
  const hook = makeViteHook({enabled: true})
  const configResolved = hook.configResolved
  if (typeof configResolved === 'function')
    configResolved.call({} as never, {root: ROOT, plugins: peerPlugins} as never)
  const transform = hook.transform
  const run = typeof transform === 'function' ? transform : transform?.handler
  if (!run) throw new Error('conciv plugin has no transform')
  const result = run.call(
    {} as never,
    'export const A = () => <div>hi</div>\n',
    `${ROOT}/src/App.tsx`,
    undefined as never,
  )
  return result as {code: string} | null
}

const reactPlugin: Plugin = {name: 'vite:react'}
const tsdInjectSource: Plugin = {name: '@tanstack/devtools:inject-source'}

describe('addSourceToJsx', () => {
  it('stamps a host element with data-conciv-source="<relpath>:<line>:<col>"', () => {
    const code = `export const A = () => <div className="x">hi</div>\n`
    const out = addSourceToJsx(code, `${ROOT}/src/App.tsx`, ROOT)
    expect(out).not.toBeNull()
    expect(out!.code).toContain('data-conciv-source="src/App.tsx:1:24"')
    expect(out!.code).toContain('className="x"')
  })

  it('handles self-closing elements', () => {
    const code = `export const B = () => <img src="a.png" />\n`
    const out = addSourceToJsx(code, `${ROOT}/src/B.tsx`, ROOT)
    expect(out!.code).toMatch(/<img src="a\.png"\s+data-conciv-source="src\/B\.tsx:1:\d+"\s*\/>/)
  })

  it('skips Fragments', () => {
    const code = `export const C = () => <><span>x</span></>\n`
    const out = addSourceToJsx(code, `${ROOT}/src/C.tsx`, ROOT)

    expect(out!.code).toContain('<span data-conciv-source=')
    expect(out!.code).not.toContain('<> data-conciv-source')
  })

  it('returns null for non-JSX files', () => {
    expect(addSourceToJsx('export const x = 1', `${ROOT}/src/util.ts`, ROOT)).toBeNull()
  })

  it('returns null when there is no JSX', () => {
    expect(addSourceToJsx('export const x = 1', `${ROOT}/src/util.tsx`, ROOT)).toBeNull()
  })

  it('does not double-stamp an element that already has the attribute', () => {
    const code = `export const D = () => <div data-conciv-source="x">y</div>\n`
    const out = addSourceToJsx(code, `${ROOT}/src/D.tsx`, ROOT)
    expect(out).toBeNull()
  })

  it('JSON-escapes the path so a quote cannot break out of the attribute', () => {
    const code = `export const E = () => <div>q</div>\n`
    const out = addSourceToJsx(code, `${ROOT}/src/we"ird.tsx`, ROOT)

    expect(out!.code).toContain('\\"')
    expect(out!.code).not.toContain('data-conciv-source="src/we"ird')
  })

  it('stamps line numbers from the on-disk source, stable across per-environment line shifts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conciv-inject-'))
    const raw = [
      'export function Root() {',
      '  return (',
      '    <html lang="en">',
      '      <head><title>x</title></head>',
      '      <body>hi</body>',
      '    </html>',
      '  )',
      '}',
      '',
    ].join('\n')
    const file = join(dir, 'App.tsx')
    writeFileSync(file, raw)

    const client = addSourceToJsx(raw, file, dir)
    const server = addSourceToJsx('// injected by SSR transform\n'.repeat(12) + raw, file, dir)

    expect(client).not.toBeNull()
    expect(server).not.toBeNull()

    expect(sourceValues(server!.code)).toEqual(sourceValues(client!.code))
    expect(sourceValues(client!.code)).toContain('App.tsx:5:7')
  })
})

describe('makeViteHook source injection', () => {
  it('stamps data-conciv-source when no @tanstack/devtools source injector is present', () => {
    const out = transformViaHook([reactPlugin])
    expect(out?.code).toContain('data-conciv-source=')
  })

  it('defers to @tanstack/devtools (no data-conciv-source) when its inject-source plugin is present', () => {
    const out = transformViaHook([reactPlugin, tsdInjectSource])
    expect(out).toBeNull()
  })
})
