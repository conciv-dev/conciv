import {afterEach, describe, expect, it} from 'vitest'
import {writeFile, rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import {symbolicateFrame, symbolicateFrames} from '../../src/editor/symbolicate.js'
import {chunkWithInlineMap, cleanupChunks} from './fixtures.js'

const written: string[] = []
afterEach(async () => {
  await cleanupChunks()
  for (const f of written.splice(0)) await rm(f, {force: true})
})

const ROOT = tmpdir()

describe('symbolicateFrame', () => {
  it('resolves a file:// frame via an inline data map', async () => {
    const path = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const loc = await symbolicateFrame({fileName: `file://${path}`, line: 2, column: 1}, ROOT)
    expect(loc).toEqual({file: 'app/page.tsx', line: 17, column: 4})
  })

  it('strips the about://React/Server/ prefix and ?query', async () => {
    const path = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const loc = await symbolicateFrame({fileName: `about://React/Server/file://${path}?42`, line: 2, column: 1}, ROOT)
    expect(loc?.file).toBe('app/page.tsx')
  })

  it('resolves a sectioned (Turbopack-style) source map via AnyMap', async () => {
    const gen = new GenMapping()
    addMapping(gen, {generated: {line: 1, column: 0}, source: 'src/routes/index.tsx', original: {line: 5, column: 2}})
    const sectioned = {version: 3 as const, sections: [{offset: {line: 0, column: 0}, map: toEncodedMap(gen)}]}
    const b64 = Buffer.from(JSON.stringify(sectioned)).toString('base64')
    const path = join(tmpdir(), `conciv-sect-${Math.random().toString(36).slice(2)}.js`)
    await writeFile(path, `void 0;\n//# sourceMappingURL=data:application/json;base64,${b64}`)
    written.push(path)
    const loc = await symbolicateFrame({fileName: `file://${path}`, line: 1, column: 1}, ROOT)
    expect(loc?.file).toBe('src/routes/index.tsx')
  })

  it('resolves an http frame via the injected fetch', async () => {
    const gen = new GenMapping()
    addMapping(gen, {generated: {line: 2, column: 0}, source: 'src/App.tsx', original: {line: 9, column: 0}})
    const b64 = Buffer.from(JSON.stringify(toEncodedMap(gen))).toString('base64')
    const body = `void 0;\nvoid 1;\n//# sourceMappingURL=data:application/json;base64,${b64}`
    const fakeFetch = (async () => new Response(body)) as unknown as typeof fetch
    const loc = await symbolicateFrame(
      {fileName: 'http://localhost:3000/src/App.tsx?x=1', line: 2, column: 1},
      ROOT,
      fakeFetch,
    )
    expect(loc?.file).toBe('src/App.tsx')
  })

  it('refuses a file:// frame outside the project root (path traversal)', async () => {
    const path = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const loc = await symbolicateFrame({fileName: `file://${path}`, line: 2, column: 1}, join(ROOT, 'nope-subdir'))
    expect(loc).toBeNull()
  })

  it('refuses a non-loopback http frame (SSRF)', async () => {
    const reached = {hit: false}
    const fakeFetch = (async () => {
      reached.hit = true
      return new Response('void 0;')
    }) as unknown as typeof fetch
    const loc = await symbolicateFrame(
      {fileName: 'http://169.254.169.254/latest/meta-data', line: 1, column: 1},
      ROOT,
      fakeFetch,
    )
    expect(loc).toBeNull()
    expect(reached.hit).toBe(false)
  })

  it('skips node_modules frames in symbolicateFrames', async () => {
    const nm = await chunkWithInlineMap('node_modules/next/dist/x.js', 1, 0)
    const app = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const loc = await symbolicateFrames(
      [
        {fileName: `file://${nm}`, line: 2, column: 1},
        {fileName: `file://${app}`, line: 2, column: 1},
      ],
      ROOT,
    )
    expect(loc?.file).toBe('app/page.tsx')
  })
})
