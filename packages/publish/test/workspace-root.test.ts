import {test, expect} from 'vitest'
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {findRoot} from '../src/workspace-root.ts'

test('finds the directory holding pnpm-workspace.yaml from a nested path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ws-'))
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  const nested = join(root, 'packages', 'a', 'src')
  await mkdir(nested, {recursive: true})

  expect(await findRoot(nested)).toBe(root)
  await rm(root, {recursive: true, force: true})
})

test('throws when no workspace root exists above the start path', async () => {
  const orphan = await mkdtemp(join(tmpdir(), 'orphan-'))
  await expect(findRoot(orphan)).rejects.toThrow(/workspace root/)
  await rm(orphan, {recursive: true, force: true})
})
