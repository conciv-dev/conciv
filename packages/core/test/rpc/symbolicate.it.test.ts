import {mkdtempSync, realpathSync} from 'node:fs'
import {writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../helpers/boot.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

const root = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-symbolicate-')))

async function chunk(name: string, source: string, line: number, column: number): Promise<string> {
  const gen = new GenMapping()
  addMapping(gen, {generated: {line: 2, column: 0}, source, original: {line, column}})
  const b64 = Buffer.from(JSON.stringify(toEncodedMap(gen))).toString('base64')
  await writeFile(join(root, name), `"use strict";\nvoid 0;\n//# sourceMappingURL=data:application/json;base64,${b64}`)
  return name
}

async function bootAtRoot(): Promise<Kit> {
  const kit = await bootKit({cwd: root})
  cleanups.push(() => kit.cleanup())
  return kit
}

describe('page.symbolicate over the wire', () => {
  it('maps a bundle frame back to its original file, line and column', async () => {
    const kit = await bootAtRoot()
    const fileName = await chunk('hero-chunk.js', 'src/components/landing/hero.tsx', 42, 5)
    const loc = await kit.rpc.page.symbolicate({frames: [{fileName, line: 2, column: 1}]})
    expect(loc).toEqual({file: 'src/components/landing/hero.tsx', line: 42, column: 5})
  })

  it('skips node_modules frames and answers with the first project frame', async () => {
    const kit = await bootAtRoot()
    const vendor = await chunk('vendor-chunk.js', 'node_modules/react-dom/client.js', 10, 0)
    const app = await chunk('app-chunk.js', 'src/app.tsx', 8, 2)
    const loc = await kit.rpc.page.symbolicate({
      frames: [
        {fileName: vendor, line: 2, column: 1},
        {fileName: app, line: 2, column: 1},
      ],
    })
    expect(loc).toEqual({file: 'src/app.tsx', line: 8, column: 2})
  })

  it('answers null when no frame carries a source map', async () => {
    const kit = await bootAtRoot()
    const loc = await kit.rpc.page.symbolicate({frames: [{fileName: 'nothing-here.js', line: 1, column: 1}]})
    expect(loc).toBeNull()
  })

  it('refuses a frame that escapes the project root', async () => {
    const kit = await bootAtRoot()
    const loc = await kit.rpc.page.symbolicate({frames: [{fileName: '../outside.js', line: 1, column: 1}]})
    expect(loc).toBeNull()
  })

  it('rejects a frame that fails input validation', async () => {
    const kit = await bootAtRoot()
    await expect(kit.rpc.page.symbolicate({frames: [{fileName: '', line: 0}]})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})
