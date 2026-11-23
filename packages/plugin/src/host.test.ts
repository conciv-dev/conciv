import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {describe, expect, it} from 'vitest'
import {resolve} from './host.js'

describe('resolving a plugin', () => {
  it.each([
    ['package-with-exports', {server: 'server.js', rpc: 'rpc.js', experimental: 'plugin-experimental.js'}],
    ['folder-of-files', {server: 'server.js', experimental: 'plugin-experimental.js'}],
    ['index-only', {server: 'index.js'}],
    ['unbuilt-browser-part', {server: 'server.js'}],
  ])('a plugin laid out as %s has its built entries found', async (layout, files) => {
    const directory = fileURLToPath(new URL(`../test/fixtures/host/${layout}`, import.meta.url))

    expect(await resolve({directory})).toEqual(
      Object.fromEntries(
        Object.entries(files).map(([entry, file]) => [entry, pathToFileURL(join(directory, file)).href]),
      ),
    )
  })
})
