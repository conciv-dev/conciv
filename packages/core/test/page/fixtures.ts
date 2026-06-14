import {writeFile, rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'

const written: string[] = []

// Write a temp chunk whose generated (line 2, col 0) maps to source:line:col via an inline data map.
export async function chunkWithInlineMap(source: string, line: number, column: number): Promise<string> {
  const gen = new GenMapping()
  addMapping(gen, {generated: {line: 2, column: 0}, source, original: {line, column}})
  const b64 = Buffer.from(JSON.stringify(toEncodedMap(gen))).toString('base64')
  const path = join(tmpdir(), `aidx-chunk-${Math.random().toString(36).slice(2)}.js`)
  await writeFile(path, `"use strict";\nvoid 0;\n//# sourceMappingURL=data:application/json;base64,${b64}`)
  written.push(path)
  return path
}

export async function cleanupChunks(): Promise<void> {
  for (const f of written.splice(0)) await rm(f, {force: true})
}
