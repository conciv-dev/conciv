import {execFile} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {promisify} from 'node:util'
import {expect, it} from 'vitest'
import {z} from 'zod'

it('documents every published package, their own exports in full and re-exports as references', async () => {
  const {stdout} = await promisify(execFile)('pnpm', ['ls', '--recursive', '--depth', '-1', '--json'])
  const workspaces = z.array(z.object({name: z.string(), private: z.boolean().optional()})).parse(JSON.parse(stdout))
  const published = workspaces.filter((workspace) => workspace.private !== true).map((workspace) => workspace.name)
  const manifest = z
    .object({devDependencies: z.record(z.string(), z.string())})
    .parse(JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')))
  const documented = Object.keys(manifest.devDependencies).filter((name) => name.startsWith('@conciv/'))

  expect(documented.toSorted()).toEqual(published.toSorted())

  const member = z.object({
    name: z.string(),
    comment: z.object({blockTags: z.array(z.object({tag: z.string()}))}).optional(),
  })
  const declaration = z.object({
    name: z.string(),
    flags: z.object({isExternal: z.boolean().optional()}),
    children: z.array(member).optional(),
    type: z.object({type: z.string(), package: z.string().optional()}).optional(),
  })
  const project = z
    .object({children: z.array(z.object({name: z.string(), children: z.array(declaration)}))})
    .parse(JSON.parse(await readFile(new URL('../../dist/backend-plugin-api.json', import.meta.url), 'utf8')))
  const root = project.children.find((module) => module.name === '.')?.children ?? []
  const pluginOptions = root.find((entry) => entry.name === 'PluginOptions')
  const modelDomain = root.find((entry) => entry.name === 'ModelDomain')

  expect(pluginOptions).toMatchObject({
    flags: {isExternal: true},
    type: {type: 'reference', package: '@conciv/protocol'},
  })
  expect(pluginOptions?.children).toBeUndefined()
  expect(modelDomain?.flags.isExternal).toBeUndefined()
  expect(modelDomain?.children?.map((child) => child.name)).toEqual(['default', 'list', 'reload', 'transform'])
  expect(modelDomain?.children?.find((child) => child.name === 'reload')?.comment?.blockTags).toContainEqual({
    tag: '@remarks',
  })
})
