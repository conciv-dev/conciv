import {readdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))
const clientBundle = readFileSync(distDir + 'client.js', 'utf8')
const otherChunks = readdirSync(distDir).filter((name) => name.endsWith('.js') && name !== 'client.js')

const excalidrawRuntimeMarker = 'excalidraw.com'

const chunksContaining = (marker: string): string[] =>
  otherChunks.filter((name) => readFileSync(distDir + name, 'utf8').includes(marker))

describe('excalidraw stays lazy-loaded instead of pinned into client.js', () => {
  it('does not bundle the excalidraw runtime into the eagerly-loaded client entry', () => {
    expect(clientBundle.includes(excalidrawRuntimeMarker)).toBe(false)
  })

  it('still ships the excalidraw runtime in a separately chunked file', () => {
    expect(chunksContaining(excalidrawRuntimeMarker).length).toBeGreaterThan(0)
  })
})
