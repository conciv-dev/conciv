import {readdir, readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect, it} from 'vitest'

const SOURCE_ROOT = fileURLToPath(new URL('../src', import.meta.url))
const ARMS_A_RECONCILE_LOOP = /\.scrollTo(?:End|Index|Offset)\(|\.scrollBy\(/

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

it('never calls a virtualizer scroll method that arms virtual-core reconcile loop', async () => {
  const files = await sourceFiles(SOURCE_ROOT)
  const sources = await Promise.all(files.map(async (path) => ({path, text: await readFile(path, 'utf8')})))
  const offenders = sources
    .filter(({text}) => ARMS_A_RECONCILE_LOOP.test(text))
    .map(({path}) => path.slice(SOURCE_ROOT.length + 1))

  expect(offenders).toEqual([])
})
