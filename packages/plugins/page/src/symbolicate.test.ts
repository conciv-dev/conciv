import {fileURLToPath} from 'node:url'
import {Effect} from 'effect'
import {describe, expect, it} from 'vitest'
import {symbolicateFrames} from './symbolicate.js'

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
    const located = symbolicateFrames(
      frames.map((fileName) => ({fileName, line: 1, column: 1})),
      root,
    )
    expect(await Effect.runPromise(located)).toEqual(source)
  })
})
