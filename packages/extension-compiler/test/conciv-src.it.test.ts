import {describe, expect, it} from 'vitest'
import {fileURLToPath} from 'node:url'
import {isConcivSrcTsx} from '../src/conciv-src.js'
import {transformConcivModule} from '../src/vite-plumbing.js'

const fixture = (rel: string) => fileURLToPath(new URL(`./fixtures/conciv-src/${rel}`, import.meta.url))

describe('isConcivSrcTsx', () => {
  it('matches src tsx inside an @conciv-scoped package', () => {
    expect(isConcivSrcTsx(fixture('scoped/src/button.tsx'))).toBe(true)
  })

  it('matches src tsx inside the package named conciv', () => {
    expect(isConcivSrcTsx(fixture('app/src/entry.tsx'))).toBe(true)
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

describe('transformConcivModule routing', () => {
  it('solid-compiles conciv src tsx', async () => {
    const id = fixture('scoped/src/button.tsx')
    const result = await transformConcivModule(`export const Button = () => <button>ok</button>`, id, false, {
      root: '/repo',
      deferToTsd: false,
    })
    expect(result?.code).toContain('_$template')
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
