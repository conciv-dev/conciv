import {readFile} from 'node:fs/promises'
import {createServer} from 'node:http'
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

  const withAssets = it.extend<{assets: {origin: string; fetched: string[]}}>({
    assets: async ({task: _task}, use) => {
      const fetched: string[] = []
      const server = createServer((request, response) => {
        const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
        fetched.push(path)
        readFile(`${project}${path}`, 'utf8').then(
          (body) => response.end(body),
          () => response.writeHead(404).end(),
        )
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      try {
        await use({origin: `http://127.0.0.1:${port}`, fetched})
      } finally {
        await new Promise((resolve) => server.close(resolve))
      }
    },
  })

  withAssets('a chunk located twice is fetched and its map parsed once', async ({assets}) => {
    const frame = {fileName: `${assets.origin}/assets/checkout.js?t=1`, line: 1, column: 1}
    const located = Effect.flatMap(makeSymbolicator({root: project}), (symbolicator) =>
      Effect.all([symbolicator.frames([frame]), symbolicator.frames([frame, frame])]),
    )
    expect(await Effect.runPromise(located)).toEqual([app, app])
    expect(assets.fetched).toEqual(['/assets/checkout.js', '/assets/checkout.js.map'])
  })
})
