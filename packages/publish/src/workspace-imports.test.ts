import {test, expect, describe} from 'vitest'
import {writeFile, mkdir, symlink} from 'node:fs/promises'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execa} from 'execa'
import {
  assertBuildDependsOnCoversImports,
  assertPluginsDrawThroughContextUi,
  assertTypecheckDependsOnDistReads,
} from './workspace-imports.ts'
import {scaffoldWorkspaceRoot, writeManifest} from '../test/helpers.ts'

async function commitFiles(root: string, files: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      await mkdir(dirname(join(root, path)), {recursive: true})
      await writeFile(join(root, path), content)
    }),
  )
  await execa('git', ['init', '-q'], {cwd: root})
  await execa('git', ['add', '.'], {cwd: root})
}
describe('turbo build dependsOn', () => {
  test('an explicit build list names every workspace build its build sources import, not test-only imports', async () => {
    const root = await scaffoldWorkspaceRoot('turbo-depends-on-')
    const files: Record<string, string> = {
      'packages/a/turbo.json': JSON.stringify({tasks: {build: {dependsOn: ['@conciv/b#build']}}}),
      'packages/a/src/index.ts': "import {b} from '@conciv/b'\nexport const c = await import('@conciv/c/view')\n",
      'packages/a/vite.config.ts': "export const alias = import.meta.resolve('@conciv/d')\n",
      'packages/a/vitest.config.ts': "import '@conciv/e'\n",
      'packages/a/test/a.test.ts': "import '@conciv/e'\n",
      'packages/a/src/a.test.ts': "import '@conciv/e'\nimport '@conciv/plain'\n",
    }
    await Promise.all([
      ...['a', 'b', 'c', 'd', 'e'].map((name) =>
        writeManifest(join(root, 'packages', name), {name: `@conciv/${name}`, scripts: {build: 'tsdown'}}),
      ),
      writeManifest(join(root, 'packages', 'plain'), {name: '@conciv/plain'}),
    ])
    await commitFiles(root, files)
    const failure = await assertBuildDependsOnCoversImports(root).catch((error: unknown) => String(error))
    expect(failure).toContain('packages/a/turbo.json: build imports @conciv/c but does not depend on @conciv/c#build')
    expect(failure).toContain('packages/a/turbo.json: build imports @conciv/d but does not depend on @conciv/d#build')
    expect(failure).not.toContain('@conciv/e')
    const dependsOn = ['@conciv/b#build', '@conciv/c#build', '@conciv/d#build']
    await writeFile(join(root, 'packages/a/turbo.json'), JSON.stringify({tasks: {build: {dependsOn}}}))
    await expect(assertBuildDependsOnCoversImports(root)).resolves.toBeUndefined()
  })

  test('a typecheck depends on the build of every package whose dist its program reads, through source packages too', async () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    const root = await scaffoldWorkspaceRoot('turbo-typecheck-')
    const json = (value: Record<string, unknown>) => JSON.stringify(value)
    const tasks = {build: {dependsOn: ['^build']}, typecheck: {dependsOn: ['^build']}}
    const scripts = {build: 'tsdown'}
    const dist = (entry: string) => ({exports: {[entry]: {types: `./dist/${entry}.d.ts`}}, scripts})
    await commitFiles(root, {
      'package.json': json({name: 'workspace-root', private: true, packageManager: 'pnpm@11.7.0'}),
      'turbo.json': json({tasks}),
      'packages/kit/package.json': json({
        name: '@conciv/kit',
        scripts: {...scripts, typecheck: 'tsc -p tsconfig.json --noEmit'},
        dependencies: {'@conciv/direct': 'workspace:*'},
        peerDependencies: {'@conciv/app': 'workspace:*'},
      }),
      'packages/kit/tsconfig.json': json({extends: '@conciv/tsconfig/tsconfig.base.json'}),
      'packages/kit/src/index.ts': "import '@conciv/app'\nimport '@conciv/direct'\n",
      'packages/app/package.json': json({name: '@conciv/app', exports: {'.': './src/index.ts'}, scripts}),
      'packages/app/src/index.ts': "import '@conciv/tool/client'\n",
      'packages/tool/package.json': json({name: '@conciv/tool', ...dist('./client')}),
      'packages/direct/package.json': json({name: '@conciv/direct', ...dist('.')}),
    })
    await symlink(join(repoRoot, 'node_modules'), join(root, 'node_modules'))
    const links = {kit: ['tsconfig', 'app', 'direct'], app: ['tool']}
    await Promise.all(
      Object.entries(links).flatMap(([from, targets]) =>
        targets.map(async (target) => {
          const scope = join(root, 'packages', from, 'node_modules', '@conciv')
          await mkdir(scope, {recursive: true})
          const source = target === 'tsconfig' ? join(repoRoot, 'packages', 'tsconfig') : join(root, 'packages', target)
          await symlink(source, join(scope, target))
        }),
      ),
    )
    const failure = await assertTypecheckDependsOnDistReads(root).catch((error: unknown) => String(error))
    expect(failure).toContain('@conciv/kit#typecheck reads @conciv/tool dist but does not depend on @conciv/tool#build')
    expect(failure).not.toContain('reads @conciv/direct')
    expect(failure).not.toContain('reads @conciv/app')
    const dependsOn = ['^build', '@conciv/tool#build']
    await writeFile(join(root, 'packages/kit/turbo.json'), json({extends: ['//'], tasks: {typecheck: {dependsOn}}}))
    await expect(assertTypecheckDependsOnDistReads(root)).resolves.toBeUndefined()
  })
})

describe('plugin ui kit', () => {
  test('a plugin draws through ctx.ui: kit imports in build sources or manifests fail, built-ins and tests pass', async () => {
    const root = await scaffoldWorkspaceRoot('plugin-ui-kit-', ['packages/*', 'packages/plugins/*'])
    const manifest = (value: Record<string, unknown>) => JSON.stringify(value)
    const drawn = "import {Button} from '@conciv/ui-kit-system'\nexport const view = Button\n"
    await commitFiles(root, {
      'packages/ui-kit-system/package.json': manifest({name: '@conciv/ui-kit-system'}),
      'packages/plugins/drawn/package.json': manifest({name: '@conciv/plugin-drawn'}),
      'packages/plugins/drawn/src/view.tsx': drawn,
      'packages/plugins/drawn/test/view.test.tsx': "import '@conciv/ui-kit-chat'\n",
      'packages/plugins/listed/package.json': manifest({
        name: '@conciv/plugin-listed',
        devDependencies: {'@conciv/ui-kit-chat': 'workspace:*'},
      }),
      'packages/plugins/terminal/package.json': manifest({
        name: '@conciv/plugin-terminal',
        dependencies: {'@conciv/ui-kit-system': 'workspace:*'},
      }),
      'packages/plugins/terminal/src/pane.tsx': drawn,
    })
    const failure = await assertPluginsDrawThroughContextUi(root).catch((error: unknown) => String(error))
    expect(failure).toContain('packages/plugins/drawn/src/view.tsx: imports @conciv/ui-kit-system')
    expect(failure).toContain('packages/plugins/listed/package.json: devDependencies names @conciv/ui-kit-chat')
    expect(failure).not.toContain('view.test.tsx')
    expect(failure).not.toContain('packages/plugins/terminal')
    await writeFile(join(root, 'packages/plugins/drawn/src/view.tsx'), 'export const view = 1\n')
    await writeManifest(join(root, 'packages/plugins/listed'), {name: '@conciv/plugin-listed'})
    await expect(assertPluginsDrawThroughContextUi(root)).resolves.toBeUndefined()
  })
})
