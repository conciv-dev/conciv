import {execFile} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {promisify} from 'node:util'
import {expect, it} from 'vitest'
import {z} from 'zod'

it('documents every published package and nothing else', async () => {
  const {stdout} = await promisify(execFile)('pnpm', ['ls', '--recursive', '--depth', '-1', '--json'])
  const workspaces = z.array(z.object({name: z.string(), private: z.boolean().optional()})).parse(JSON.parse(stdout))
  const published = workspaces.filter((workspace) => workspace.private !== true).map((workspace) => workspace.name)
  const manifest = z
    .object({devDependencies: z.record(z.string(), z.string())})
    .parse(JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')))
  const documented = Object.keys(manifest.devDependencies).filter((name) => name.startsWith('@conciv/'))

  expect(documented.toSorted()).toEqual(published.toSorted())
})
