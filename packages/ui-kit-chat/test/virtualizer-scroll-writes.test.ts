import {readdir, readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect, it} from 'vitest'

const SOURCE_ROOT = fileURLToPath(new URL('../src', import.meta.url))
const WRITES_THE_SCROLL_POSITION =
  /\.scrollTo(?:End|Index|Offset)\(|\.scrollBy\(|\.scrollTo\(|\.scrollIntoView\(|followOnAppend\s*:\s*true|scrollTop\s*=(?!=)|scrollLeft\s*=(?!=)/
const LANDS_THE_VIEWPORT = /elementScroll\(/g
const ONLY_LANDING_SITE = 'behaviors/create-thread-virtualizer.ts'

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true})
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return sourceFiles(path)
      return /\.tsx?$/.test(entry.name) ? [path] : []
    }),
  )
  return nested.flat()
}

async function readSources(): Promise<{path: string; text: string}[]> {
  const files = await sourceFiles(SOURCE_ROOT)
  return Promise.all(
    files.map(async (path) => ({path: path.slice(SOURCE_ROOT.length + 1), text: await readFile(path, 'utf8')})),
  )
}

it('never writes the thread scroll position outside the single landing call site', async () => {
  const sources = await readSources()
  const offenders = sources.filter(({text}) => WRITES_THE_SCROLL_POSITION.test(text)).map(({path}) => path)

  expect(offenders).toEqual([])
})

it('lands the viewport from exactly one call site', async () => {
  const sources = await readSources()
  const landings = sources.flatMap(({path, text}) => (text.match(LANDS_THE_VIEWPORT) ?? []).map(() => path))

  expect(landings).toEqual([ONLY_LANDING_SITE])
})
