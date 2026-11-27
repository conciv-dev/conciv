import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import {Effect} from 'effect'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import type {KeyMap} from '../../src/com/key-map.js'
import {stampJsx} from '../../src/com/stamp.js'

describe('a component keeps its key while its file is edited', () => {
  const root = tempDir('design-com-')
  const tsdSource = (code: string) => code.replaceAll(/<(\w+)/g, '<$1 data-tsd-source="/src/app.tsx:1:1"')
  const keysIn = (code: string | undefined) =>
    [...(code ?? '').matchAll(/data-conciv-key="([^"]+)"/g)].map((match) => match[1])
  const serve = async (keys: KeyMap, text: string, name = 'app.tsx') => {
    const id = join(root, name)
    await writeFile(id, text)
    const stamped = await Effect.runPromise(
      stampJsx({keys, root, code: tsdSource(text), id}).pipe(Effect.provide(NodeServices.layer)),
    )
    return stamped?.code
  }

  it('keys every host element, keeps the keys across edits and renders, and stamps component call sites', async () => {
    const keys: KeyMap = new Map()
    const first = [
      "import {Card} from './card'",
      'export const App = () => (',
      '  <main class="a">',
      '    <h1>Title</h1>',
      '    <p>Body</p>',
      '  </main>',
      ')',
    ]
    const served = await serve(keys, first.join('\n'))
    const minted = keysIn(served)
    expect(minted).toHaveLength(3)
    expect(new Set(minted).size).toBe(3)
    expect(served).toContain('data-tsd-source')

    const otherLine = ['const unused = 1', ...first]
    expect(keysIn(await serve(keys, otherLine.join('\n')))).toEqual(minted)

    const ownAttributes = otherLine.map((line) => line.replace('<h1>', '<h1 class="big" id="title">'))
    expect(keysIn(await serve(keys, ownAttributes.join('\n')))).toEqual(minted)

    const added = ownAttributes.map((line) => line.replace('<p>Body</p>', '<span>New</span><p>Body</p>'))
    const afterAdd = keysIn(await serve(keys, added.join('\n')))
    expect(afterAdd).toHaveLength(4)
    expect([afterAdd[0], afterAdd[1], afterAdd[3]]).toEqual(minted)
    expect(minted).not.toContain(afterAdd[2])

    const fresh: KeyMap = new Map()
    const server = await serve(fresh, added.join('\n'))
    const client = await serve(fresh, added.join('\n'))
    expect(keysIn(client)).toEqual(keysIn(server))

    expect(keysIn(await serve(new Map(), first.join('\n')))).toEqual(minted)

    const own = added.map((line) => line.replace('<h1 class', '<h1 data-conciv-key="mine" class'))
    const withOwn = await serve(keys, own.join('\n'))
    expect(withOwn).toContain('data-conciv-key="mine"')
    expect(withOwn?.match(/data-conciv-key/g)).toHaveLength(4)

    const called = await serve(keys, ["import {Card} from './card'", 'export const App = () => <Card />'].join('\n'))
    expect(called).toContain('data-conciv-site="app.tsx:2"')
  })

  it.each([
    {skip: 'a file that is not jsx', name: 'app.ts', text: 'export const App = () => <div />'},
    {skip: 'a file with no jsx', name: 'none.tsx', text: 'export const n = 1'},
    {skip: 'a fragment', name: 'fragment.tsx', text: 'export const App = () => <Fragment></Fragment>'},
    {skip: 'a file that does not parse', name: 'broken.tsx', text: 'export const App = () => <div'},
  ])('leaves $skip alone', async ({name, text}) => {
    expect(await serve(new Map(), text, name)).toBeUndefined()
  })
})
