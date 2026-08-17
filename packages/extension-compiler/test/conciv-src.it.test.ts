import {describe, expect, it} from 'vitest'
import {fileURLToPath} from 'node:url'
import {concivSrcEntry, isConcivSrcTsx} from '../src/conciv-src.js'
import {transformConcivModule} from '../src/vite-plumbing.js'

const fixture = (rel: string) => fileURLToPath(new URL(`./fixtures/conciv-src/${rel}`, import.meta.url))

describe('isConcivSrcTsx', () => {
  it('matches src tsx inside an @conciv-scoped package', () => {
    expect(isConcivSrcTsx(fixture('scoped/src/button.tsx'))).toBe(true)
  })

  it('rejects src tsx inside a package named bare conciv (the CLI owns that name)', () => {
    expect(isConcivSrcTsx(fixture('app/src/entry.tsx'))).toBe(false)
  })

  it('rejects src tsx belonging to a host package', () => {
    expect(isConcivSrcTsx(fixture('other/src/button.tsx'))).toBe(false)
  })

  it('rejects non-tsx and non-src ids', () => {
    expect(isConcivSrcTsx(fixture('scoped/src/button.tsx').replace('.tsx', '.ts'))).toBe(false)
    expect(isConcivSrcTsx(fixture('scoped/package.json'))).toBe(false)
  })

  it('ignores vite query suffixes', () => {
    expect(isConcivSrcTsx(`${fixture('scoped/src/button.tsx')}?v=abc123`)).toBe(true)
  })

  it('rejects anything under node_modules', () => {
    expect(isConcivSrcTsx(`/repo/node_modules/@conciv/x/src/a.tsx`)).toBe(false)
  })
})

describe('concivSrcEntry', () => {
  it('maps a dist entry to its tsx source sibling', () => {
    expect(concivSrcEntry(fixture('scoped/dist/index.js'))).toBe(fixture('scoped/src/index.tsx'))
  })

  it('maps a dist entry to its ts source sibling', () => {
    expect(concivSrcEntry(fixture('scoped/dist/tokens.js'))).toBe(fixture('scoped/src/tokens.ts'))
  })

  it('maps a jsx dist entry to its ts source sibling', () => {
    expect(concivSrcEntry(fixture('scoped/dist/solid/index.jsx'))).toBe(fixture('scoped/src/solid/index.ts'))
  })

  it('keeps a react-jsx subtree on dist even though a ts source sibling exists, regardless of folder name', () => {
    expect(concivSrcEntry(fixture('scoped/dist/wrapper/index.js'))).toBeNull()
  })

  it('keeps a react-jsx subtree on dist even though a tsx source sibling exists, regardless of folder name', () => {
    expect(concivSrcEntry(fixture('scoped/dist/wrapper/mascot-root.js'))).toBeNull()
  })

  it('remaps the package root to src even when a sibling subtree carries its own react-jsx tsconfig', () => {
    expect(concivSrcEntry(fixture('scoped/dist/index.js'))).toBe(fixture('scoped/src/index.tsx'))
  })

  it('keeps a dist entry on dist when its own tsconfig sets an explicit non-solid jsxImportSource', () => {
    expect(concivSrcEntry(fixture('scoped/dist/explicit-react/index.js'))).toBeNull()
  })

  it('remaps a dist entry with no tsconfig of its own and no jsx anywhere in the chain (ts-only package)', () => {
    expect(concivSrcEntry(fixture('plain/dist/index.js'))).toBe(fixture('plain/src/index.ts'))
  })

  it('remaps a dist entry whose own tsconfig is empty and inherits jsxImportSource solid-js via extends', () => {
    expect(concivSrcEntry(fixture('scoped/dist/inherited/index.js'))).toBe(fixture('scoped/src/inherited/index.tsx'))
  })

  it('returns null when no source sibling exists', () => {
    expect(concivSrcEntry(fixture('scoped/dist/nope.js'))).toBeNull()
  })

  it('returns null for paths outside dist', () => {
    expect(concivSrcEntry(fixture('scoped/src/index.tsx'))).toBeNull()
    expect(concivSrcEntry(fixture('scoped/package.json'))).toBeNull()
  })

  it('returns null under node_modules', () => {
    expect(concivSrcEntry('/repo/node_modules/@conciv/x/dist/index.js')).toBeNull()
  })
})

describe('transformConcivModule routing', () => {
  it('solid-compiles conciv src tsx', async () => {
    const id = fixture('scoped/src/button.tsx')
    const result = await transformConcivModule(`export const Button = () => <button>ok</button>`, id, false, {
      root: '/repo',
      deferToTsd: false,
    })
    expect(result?.code).toContain('_$template')
  })

  it('stamps jsx source onto conciv src tsx before compiling', async () => {
    const id = fixture('scoped/src/button.tsx')
    const result = await transformConcivModule(`export const Button = () => <button>ok</button>`, id, false, {
      root: '/repo',
      deferToTsd: false,
    })
    expect(result?.code).toContain('data-conciv-source')
  })

  it('stamps jsx source even when a devtools stamper is present downstream', async () => {
    const id = fixture('scoped/src/button.tsx')
    const result = await transformConcivModule(`export const Button = () => <button>ok</button>`, id, false, {
      root: '/repo',
      deferToTsd: true,
    })
    expect(result?.code).toContain('data-conciv-source')
  })

  it('leaves host src tsx alone (falls through to jsx source stamping)', async () => {
    const id = fixture('other/src/button.tsx')
    const result = await transformConcivModule(`export const Button = () => <button>host</button>`, id, false, {
      root: '/repo',
      deferToTsd: false,
    })
    expect(result?.code ?? '').not.toContain('_$template')
  })
})
