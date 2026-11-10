import {cp} from 'node:fs/promises'
import {basename, join} from 'node:path'
import {fileURLToPath} from 'node:url'

export async function lane(input: {root: string; wave: string; label: string}): Promise<string> {
  const dir = join(input.root, input.wave, input.label)
  await cp(HOST_ROOT, dir, {recursive: true, filter: (source) => !SKIPPED.has(basename(source))})
  return dir
}

const HOST_ROOT = fileURLToPath(new URL('../../test/fixtures/design/host/', import.meta.url))

const SKIPPED = new Set(['node_modules', '.conciv'])
