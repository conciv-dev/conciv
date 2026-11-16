import {readFileSync} from 'node:fs'
import {rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import {afterEach, describe, expect, it} from 'vitest'
import {symbolicateFrame} from '../src/symbolicate.js'

const written: string[] = []

async function chunkWithInlineMap(source: string, line: number, column: number): Promise<string> {
  const gen = new GenMapping()
  addMapping(gen, {generated: {line: 2, column: 0}, source, original: {line, column}})
  const b64 = Buffer.from(JSON.stringify(toEncodedMap(gen))).toString('base64')
  const path = join(tmpdir(), `conciv-chunk-${Math.random().toString(36).slice(2)}.js`)
  await writeFile(path, `"use strict";\nvoid 0;\n//# sourceMappingURL=data:application/json;base64,${b64}`)
  written.push(path)
  return path
}

describe('symbolicate', () => {
  afterEach(async () => {
    for (const path of written.splice(0)) await rm(path, {force: true})
  })

  it('reads a React server frame, fetches a loopback http frame, and never fetches another host', async () => {
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const fetched: string[] = []
    const fakeFetch: typeof fetch = async (input) => {
      fetched.push(String(input))
      return new Response(readFileSync(chunk, 'utf8'))
    }
    const at = (fileName: string) => symbolicateFrame({fileName, line: 2, column: 1}, tmpdir(), fakeFetch)
    expect((await at(`about://React/Server/file://${chunk}?42`))?.file).toBe('app/page.tsx')
    expect((await at('http://localhost:3000/src/App.tsx?x=1'))?.file).toBe('app/page.tsx')
    expect(await at('http://169.254.169.254/latest/meta-data')).toBeNull()
    expect(fetched.some((url) => url.includes('169.254'))).toBe(false)
  })

  it('answers null for a frame with no fileName and reads nothing', async () => {
    const fetched: string[] = []
    const fakeFetch: typeof fetch = async (input) => {
      fetched.push(String(input))
      return new Response('')
    }
    expect(await symbolicateFrame({line: 2, column: 1}, tmpdir(), fakeFetch)).toBeNull()
    expect(fetched).toEqual([])
  })
})
