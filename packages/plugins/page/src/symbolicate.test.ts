import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {Effect} from 'effect'
import {describe, expect, it} from 'vitest'
import {makeSymbolicator} from './symbolicate.js'

describe('locate names the source file and line that rendered an element', () => {
  const project = fileURLToPath(new URL('../test/fixtures/locate', import.meta.url))
  const otherProject = fileURLToPath(new URL('.', import.meta.url))
  const checkout = new URL('../test/fixtures/locate/assets/checkout.js', import.meta.url).href
  const vendor = new URL('../test/fixtures/locate/assets/vendor.js', import.meta.url).href
  const app = {file: 'src/checkout.tsx', line: 12, column: 4}
  it.each([
    {name: 'the app chunk', frames: [checkout], root: project, source: app},
    {name: 'a library frame above the app frame', frames: [vendor, checkout], root: project, source: app},
    {name: 'only a library frame', frames: [vendor], root: project, source: null},
    {name: 'a chunk outside the project', frames: [checkout], root: otherProject, source: null},
  ])('$name', async ({frames, root, source}) => {
    const located = Effect.flatMap(makeSymbolicator({root}), (symbolicator) =>
      symbolicator.frames(frames.map((fileName) => ({fileName, line: 1, column: 1}))),
    )
    expect(await Effect.runPromise(located)).toEqual(source)
  })

  it('a chunk located twice is fetched and its map parsed once', async () => {
    const fetched: string[] = []
    const served = async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      fetched.push(url.pathname)
      return new Response(await readFile(`${project}${url.pathname}`, 'utf8'))
    }
    const frame = {fileName: 'http://127.0.0.1:5173/assets/checkout.js?t=1', line: 1, column: 1}
    const located = Effect.flatMap(makeSymbolicator({root: project, fetch: served}), (symbolicator) =>
      Effect.all([symbolicator.frames([frame]), symbolicator.frames([frame, frame])]),
    )
    expect(await Effect.runPromise(located)).toEqual([app, app])
    expect(fetched).toEqual(['/assets/checkout.js', '/assets/checkout.js.map'])
  })
})
