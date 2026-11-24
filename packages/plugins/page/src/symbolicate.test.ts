import {readFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from '@effect/vitest'
import {Effect} from 'effect'
import {makeSymbolicator} from './symbolicate.js'

describe('locate names the source file and line that rendered an element', () => {
  const project = fileURLToPath(new URL('../test/fixtures/locate', import.meta.url))
  const otherProject = fileURLToPath(new URL('.', import.meta.url))
  const checkout = new URL('../test/fixtures/locate/assets/checkout.js', import.meta.url).href
  const vendor = new URL('../test/fixtures/locate/assets/vendor.js', import.meta.url).href
  const app = {file: 'src/checkout.tsx', line: 12, column: 4}
  it.live.each([
    {name: 'the app chunk', frames: [checkout], root: project, source: app},
    {name: 'a library frame above the app frame', frames: [vendor, checkout], root: project, source: app},
    {name: 'only a library frame', frames: [vendor], root: project, source: null},
    {name: 'a chunk outside the project', frames: [checkout], root: otherProject, source: null},
  ])('$name', ({frames, root, source}) =>
    Effect.gen(function* () {
      const symbolicator = yield* makeSymbolicator({root})
      expect(yield* symbolicator.frames(frames.map((fileName) => ({fileName, line: 1, column: 1})))).toEqual(source)
    }),
  )

  const serveAssets = Effect.acquireRelease(
    Effect.promise(async () => {
      const fetched: string[] = []
      const missingOnce: string[] = []
      const server = createServer((request, response) => {
        const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
        fetched.push(path)
        const missing = missingOnce.indexOf(path)
        if (missing !== -1) {
          missingOnce.splice(missing, 1)
          return void response.writeHead(404).end('Not Found')
        }
        readFile(`${project}${path}`, 'utf8').then(
          (body) => response.end(body),
          () => response.writeHead(404).end(),
        )
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      return {server, origin: `http://127.0.0.1:${port}`, fetched, missingOnce}
    }),
    ({server}) => Effect.promise(() => new Promise((resolve) => server.close(resolve))),
  )

  it.live('a chunk located twice is fetched and its map parsed once', () =>
    Effect.gen(function* () {
      const assets = yield* serveAssets
      const frame = {fileName: `${assets.origin}/assets/checkout.js?t=1`, line: 1, column: 1}
      const symbolicator = yield* makeSymbolicator({root: project})
      expect(yield* Effect.all([symbolicator.frames([frame]), symbolicator.frames([frame, frame])])).toEqual([app, app])
      expect(assets.fetched).toEqual(['/assets/checkout.js', '/assets/checkout.js.map'])
    }),
  )

  it.live('a map the dev server could not serve yet is fetched again on the next locate', () =>
    Effect.gen(function* () {
      const assets = yield* serveAssets
      assets.missingOnce.push('/assets/checkout.js.map')
      const frame = {fileName: `${assets.origin}/assets/checkout.js?t=1`, line: 1, column: 1}
      const symbolicator = yield* makeSymbolicator({root: project})
      expect(yield* Effect.all([symbolicator.frames([frame]), symbolicator.frames([frame])])).toEqual([null, app])
    }),
  )
})
