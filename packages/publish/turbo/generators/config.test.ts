import {cp, readdir, readFile, rm} from 'node:fs/promises'
import {join, relative} from 'node:path'
import {execa} from 'execa'
import {describe, expect, test} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'

describe('turbo gen package', () => {
  const GENERATORS = 'packages/publish/turbo/generators'
  const TEST_FOLDERS = ['test/e2e/.gitkeep', 'test/fixtures/.gitkeep', 'test/it/.gitkeep', 'test/unit/.gitkeep']
  const BUILT_FILES = [
    'README.md',
    'package.json',
    'tsconfig.build.json',
    'tsconfig.json',
    'tsdown.config.ts',
    'vite.config.ts',
  ]

  async function listFiles(folder: string): Promise<string[]> {
    const entries = await readdir(folder, {recursive: true, withFileTypes: true})
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(folder, join(entry.parentPath, entry.name)))
      .toSorted()
  }

  async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'))
  }

  const withWorktree = test.extend<{copy: string}>({
    copy: async ({task: _task}, use) => {
      const {stdout: repo} = await execa('git', ['rev-parse', '--show-toplevel'], {cwd: import.meta.dirname})
      const copy = join(tempDir('package-generator-'), 'repo')
      await execa('git', ['worktree', 'add', '--quiet', '--detach', copy, 'HEAD'], {cwd: repo})
      await rm(join(copy, GENERATORS), {recursive: true})
      await cp(join(repo, GENERATORS), join(copy, GENERATORS), {recursive: true})
      await execa(
        'pnpm',
        [
          'install',
          '--frozen-lockfile',
          '--prefer-offline',
          '--ignore-scripts',
          '--filter',
          '.',
          '--filter',
          '@conciv/publish',
        ],
        {cwd: copy},
      )
      await use(copy)
      await execa('git', ['worktree', 'remove', '--force', copy], {cwd: repo})
    },
  })

  withWorktree(
    'makes each kind of package, edits the shared files for a published one and refuses bad answers',
    async ({copy}) => {
      const generate = async (...answers: string[]) => {
        const {all} = await execa(join(copy, 'node_modules/.bin/turbo'), ['gen', 'package', '--args', ...answers], {
          cwd: copy,
          reject: false,
          all: true,
        })
        return all
      }

      const outputs = await Promise.all([
        generate('published', 'gen-check-node', 'A published node package the generator test made.', 'node', 'skip'),
        generate('private', 'gen-check-web', 'A private browser package the generator test made.', 'browser', 'skip'),
        generate('internal', 'gen-check-both', 'An internal package the generator test made.', 'both', 'skip'),
        generate('public', 'gen-check-bad', 'x', 'node', 'skip'),
        generate('published', 'Bad', 'x', 'node', 'skip'),
      ])
      const [publishedOutput, privateOutput, internalOutput, unknownKindOutput, badNameOutput] = outputs

      expect([publishedOutput, privateOutput, internalOutput]).toEqual([
        expect.stringContaining('Success'),
        expect.stringContaining('Success'),
        expect.stringContaining('Success'),
      ])
      expect(badNameOutput).toContain('use kebab-case')
      expect(unknownKindOutput).toContain('did not recognize')
      expect(await readdir(join(copy, 'packages'))).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^(Bad|gen-check-bad)/)]),
      )

      const packages = join(copy, 'packages')
      expect(await listFiles(join(packages, 'gen-check-node'))).toEqual(
        [...BUILT_FILES, 'src/gen-check-node.ts', ...TEST_FOLDERS].toSorted(),
      )
      expect(await listFiles(join(packages, 'gen-check-web'))).toEqual(
        [...BUILT_FILES, 'src/gen-check-web.ts', ...TEST_FOLDERS].toSorted(),
      )
      expect(await listFiles(join(packages, 'gen-check-both-internal'))).toEqual(
        [
          'README.md',
          'package.json',
          'src/gen-check-both.ts',
          'tsconfig.json',
          'vite.config.ts',
          ...TEST_FOLDERS,
        ].toSorted(),
      )

      const publishedManifest = await readJson(join(packages, 'gen-check-node/package.json'))
      expect(publishedManifest).toMatchObject({
        name: '@conciv/gen-check-node',
        publishConfig: {access: 'public'},
        exports: {'.': {types: './dist/gen-check-node.d.ts', import: './dist/gen-check-node.js'}},
        scripts: {build: expect.any(String), publint: 'publint', attw: expect.any(String)},
        devDependencies: {'@types/node': 'catalog:'},
      })
      expect(publishedManifest).not.toHaveProperty('private')
      const privateManifest = await readJson(join(packages, 'gen-check-web/package.json'))
      expect(privateManifest).toMatchObject({
        name: '@conciv/gen-check-web',
        private: true,
        scripts: {build: expect.any(String)},
      })
      expect(privateManifest).not.toHaveProperty('publishConfig')
      expect(privateManifest).not.toHaveProperty('scripts.publint')
      expect(privateManifest).not.toHaveProperty(['devDependencies', '@types/node'])
      const internalManifest = await readJson(join(packages, 'gen-check-both-internal/package.json'))
      expect(internalManifest).toMatchObject({
        name: '@internal/gen-check-both',
        private: true,
        main: 'src/gen-check-both.ts',
        exports: {'.': './src/gen-check-both.ts'},
      })
      expect(internalManifest).not.toHaveProperty('scripts.build')
      for (const manifest of [publishedManifest, privateManifest, internalManifest]) {
        expect(manifest).not.toHaveProperty('scripts.lint')
      }

      expect(await readFile(join(packages, 'gen-check-node/tsdown.config.ts'), 'utf8')).toContain(
        "entry: ['src/gen-check-node.ts']",
      )
      expect(await readFile(join(packages, 'gen-check-node/tsconfig.json'), 'utf8')).toContain('tsconfig.base.json')
      expect(await readFile(join(packages, 'gen-check-web/tsconfig.json'), 'utf8')).toContain('tsconfig.web.json')
      expect(await readFile(join(packages, 'gen-check-both-internal/tsconfig.json'), 'utf8')).toMatch(
        /tsconfig\.web\.json[\s\S]*"node"/,
      )

      const guards = await readFile(join(packages, 'publish/src/guards.ts'), 'utf8')
      const fallow = await readFile(join(copy, '.fallowrc.json'), 'utf8')
      expect(guards).toContain("'@conciv/gen-check-node',")
      expect(fallow).toContain('"@conciv/gen-check-node"')
      expect(`${guards}${fallow}`).not.toMatch(/gen-check-(web|both)/)
      expect(await readFile(join(copy, '.changeset/add-gen-check-node-package.md'), 'utf8')).toContain(
        "'@conciv/gen-check-node': patch",
      )
      expect((await readdir(join(copy, '.changeset'))).filter((file) => file.startsWith('add-gen-check-'))).toEqual([
        'add-gen-check-node-package.md',
      ])

      const {stdout: lockfileChanges} = await execa('git', ['status', '--porcelain', 'pnpm-lock.yaml'], {cwd: copy})
      expect(lockfileChanges).toBe('')
      await execa(
        join(copy, 'node_modules/.bin/oxfmt'),
        [
          '--check',
          'packages/gen-check-node',
          'packages/gen-check-web',
          'packages/gen-check-both-internal',
          'packages/publish/src/guards.ts',
          '.fallowrc.json',
        ],
        {cwd: copy},
      )
    },
    30_000,
  )
})
