import * as NodeServices from '@effect/platform-node/NodeServices'
import {describe, expect, it} from '@effect/vitest'
import {Effect, FileSystem, Path} from 'effect'
import {ChildProcess, ChildProcessSpawner} from 'effect/process'
import {tempDir} from '@internal/vitest-config/temp-dir'

describe('turbo gen package', () => {
  const GENERATORS = 'packages/publish/turbo/generators'
  const LINKED_DEPENDENCIES = ['node_modules', 'packages/publish/node_modules']
  const TEST_FOLDERS = ['e2e', 'fixtures', 'it', 'unit', 'utils'].map((folder) => `test/${folder}/.gitkeep`)
  const SOURCE_FILES = ['README.md', 'package.json', 'tsconfig.json', 'vitest.config.ts', ...TEST_FOLDERS]
  const BUILT_FILES = [...SOURCE_FILES, 'tsconfig.build.json', 'tsdown.config.ts']

  const output = Effect.fn('output')(function* (cwd: string, command: string, args: string[]) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    return yield* spawner.string(ChildProcess.make(command, args, {cwd, extendEnv: true}), {includeStderr: true})
  })

  const succeed = Effect.fn('succeed')(function* (cwd: string, command: string, args: string[]) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const exitCode = yield* spawner.exitCode(ChildProcess.make(command, args, {cwd, extendEnv: true}))
    if (exitCode !== 0) return yield* Effect.fail(new Error(`${command} ${args.join(' ')} exited with ${exitCode}`))
  })

  const listFiles = Effect.fn('listFiles')(function* (folder: string) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const entries = yield* fs.readDirectory(folder, {recursive: true})
    const files = yield* Effect.filter(entries, (entry) =>
      fs.stat(path.join(folder, entry)).pipe(Effect.map((info) => info.type === 'File')),
    )
    return files.toSorted()
  })

  const readJson = Effect.fn('readJson')(function* (file: string) {
    const fs = yield* FileSystem.FileSystem
    const text = yield* fs.readFileString(file)
    const parsed: unknown = JSON.parse(text)
    return parsed
  })

  const throwawayWorktree = Effect.fn('throwawayWorktree')(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const repo = (yield* output(import.meta.dirname, 'git', ['rev-parse', '--show-toplevel'])).trim()
    const copy = yield* Effect.acquireRelease(
      Effect.sync(() => path.join(tempDir('package-generator-'), 'repo')).pipe(
        Effect.tap((folder) => succeed(repo, 'git', ['worktree', 'add', '--quiet', '--detach', folder, 'HEAD'])),
      ),
      (folder) => succeed(repo, 'git', ['worktree', 'remove', '--force', folder]).pipe(Effect.orDie),
    )
    yield* fs.remove(path.join(copy, GENERATORS), {recursive: true})
    yield* fs.copy(path.join(repo, GENERATORS), path.join(copy, GENERATORS))
    for (const dependencies of LINKED_DEPENDENCIES) {
      yield* fs.symlink(path.join(repo, dependencies), path.join(copy, dependencies))
    }
    return copy
  })

  it.live(
    'makes each kind of package, edits the shared files for a published one or a plugin and refuses bad answers',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const copy = yield* throwawayWorktree()
        const packages = path.join(copy, 'packages')
        const read = (file: string) => fs.readFileString(path.join(copy, file))
        const generate = (...answers: string[]) =>
          output(copy, path.join(copy, 'node_modules/.bin/gen'), ['run', 'package', '--args', ...answers])

        const [
          [publishedOutput, pluginOutput],
          browserOutput,
          bothOutput,
          takenEntryOutput,
          unknownKindOutput,
          badNameOutput,
          declaredNameOutput,
          existingFolderOutput,
        ] = yield* Effect.all(
          [
            Effect.all([
              generate(
                'published',
                'gen-check-node',
                'A published node package the generator test made.',
                'node',
                'skip',
              ),
              generate('plugin', 'gen-check', 'A plugin the generator test made.', 'both', 'skip'),
            ]),
            generate(
              'internal',
              'gen-check-web',
              'An internal browser package the generator test made.',
              'browser',
              'skip',
            ),
            generate('internal', 'gen-check-both', 'An internal package the generator test made.', 'both', 'skip'),
            generate('plugin', 'plugin-experimental', 'x', 'both', 'skip'),
            generate('private', 'gen-check-bad', 'x', 'node', 'skip'),
            generate('published', 'Bad', 'x', 'node', 'skip'),
            generate('published', 'plugin-page', 'x', 'node', 'skip'),
            generate('internal', 'plugins', 'x', 'node', 'skip'),
          ],
          {concurrency: 'unbounded'},
        )

        expect([publishedOutput, browserOutput, bothOutput, pluginOutput]).toEqual([
          expect.stringContaining('Success'),
          expect.stringContaining('Success'),
          expect.stringContaining('Success'),
          expect.stringContaining('Success'),
        ])
        expect(badNameOutput).toContain('use kebab-case')
        expect(takenEntryOutput).toContain('a plugin with both parts cannot be named plugin-experimental')
        expect(unknownKindOutput).toContain('did not recognize')
        expect(declaredNameOutput).toContain('@conciv/plugin-page is already declared by packages/plugins/page')
        expect(existingFolderOutput).toContain('packages/plugins already exists')
        const changed = yield* output(copy, 'git', [
          'status',
          '--porcelain',
          '--',
          '.',
          ...LINKED_DEPENDENCIES.map((dependencies) => `:!${dependencies}`),
          `:!${GENERATORS}`,
        ])
        expect(changed.split('\n').filter(Boolean).toSorted()).toEqual([
          ' M .fallowrc.json',
          ' M packages/publish/src/guards.ts',
          '?? .changeset/add-gen-check-node-package.md',
          '?? .changeset/add-gen-check-package.md',
          '?? packages/gen-check-both/',
          '?? packages/gen-check-node/',
          '?? packages/gen-check-web/',
          '?? packages/plugins/gen-check/',
        ])

        expect(yield* listFiles(path.join(packages, 'gen-check-node'))).toEqual(
          [...BUILT_FILES, 'src/gen-check-node.ts'].toSorted(),
        )
        expect(yield* listFiles(path.join(packages, 'gen-check-web'))).toEqual(
          [...SOURCE_FILES, 'src/gen-check-web.ts'].toSorted(),
        )
        expect(yield* listFiles(path.join(packages, 'gen-check-both'))).toEqual(
          [...SOURCE_FILES, 'src/gen-check-both.ts'].toSorted(),
        )
        expect(yield* listFiles(path.join(packages, 'plugins/gen-check'))).toEqual(
          [
            'README.md',
            'package.json',
            'tsconfig.json',
            'tsconfig.build.json',
            'tsdown.config.ts',
            'vite.config.ts',
            'uno.config.ts',
            'scripts/build-css.ts',
            'src/gen-check.ts',
            'src/plugin-experimental.tsx',
            ...TEST_FOLDERS,
          ].toSorted(),
        )
        expect(yield* readJson(path.join(packages, 'plugins/gen-check/package.json'))).toMatchObject({
          name: '@conciv/plugin-gen-check',
          exports: {
            '.': {types: './dist/gen-check.d.ts', import: './dist/gen-check.js'},
            './plugin-experimental': {
              types: './dist/plugin-experimental.d.cts',
              default: './dist/plugin-experimental.cjs',
            },
          },
          scripts: {'build:css': 'node scripts/build-css.ts', build: 'pnpm run build:css && tsdown && vite build'},
          peerDependencies: {'@conciv/backend-plugin-api': 'workspace:^', '@conciv/frontend-plugin-api': 'workspace:^'},
          engines: {node: expect.any(String)},
        })
        expect(yield* read('packages/plugins/gen-check/vite.config.ts')).toContain('experimental()')
        expect(yield* read('packages/plugins/gen-check/src/plugin-experimental.tsx')).toContain("'./.generated/css.js'")

        const publishedManifest = yield* readJson(path.join(packages, 'gen-check-node/package.json'))
        expect(publishedManifest).toMatchObject({
          name: '@conciv/gen-check-node',
          publishConfig: {access: 'public'},
          exports: {'.': {types: './dist/gen-check-node.d.ts', import: './dist/gen-check-node.js'}},
          scripts: {build: expect.any(String), publint: 'publint', attw: expect.any(String)},
          devDependencies: {'@types/node': 'catalog:', tsdown: 'catalog:'},
        })
        expect(publishedManifest).not.toHaveProperty('private')
        const browserManifest = yield* readJson(path.join(packages, 'gen-check-web/package.json'))
        expect(browserManifest).toMatchObject({name: '@internal/gen-check-web', private: true})
        expect(browserManifest).not.toHaveProperty(['devDependencies', '@types/node'])
        const bothManifest = yield* readJson(path.join(packages, 'gen-check-both/package.json'))
        expect(bothManifest).toMatchObject({
          name: '@internal/gen-check-both',
          private: true,
          exports: {'.': './src/gen-check-both.ts'},
          scripts: {typecheck: expect.any(String)},
        })
        for (const manifest of [browserManifest, bothManifest]) {
          expect(manifest).not.toHaveProperty('main')
          expect(manifest).not.toHaveProperty('types')
          expect(manifest).not.toHaveProperty('publishConfig')
          expect(manifest).not.toHaveProperty('scripts.build')
          expect(manifest).not.toHaveProperty(['devDependencies', 'tsdown'])
        }
        for (const manifest of [publishedManifest, browserManifest, bothManifest]) {
          expect(manifest).toMatchObject({
            devDependencies: {'@internal/tsconfig': 'workspace:*', '@internal/vitest-config': 'workspace:*'},
          })
          expect(manifest).not.toHaveProperty('scripts.lint')
          expect(manifest).not.toHaveProperty('scripts.test')
        }

        expect(yield* read('packages/gen-check-node/tsdown.config.ts')).toContain("entry: ['src/gen-check-node.ts']")
        expect(yield* read('packages/gen-check-node/tsconfig.json')).toContain('@internal/tsconfig/tsconfig.base.json')
        expect(yield* read('packages/gen-check-web/tsconfig.json')).toContain('@internal/tsconfig/tsconfig.web.json')
        expect(yield* read('packages/gen-check-both/tsconfig.json')).toMatch(/tsconfig\.web\.json[\s\S]*"node"/)
        expect(yield* read('packages/gen-check-both/vitest.config.ts')).toContain('@internal/vitest-config/conciv-test')
        expect(yield* read('packages/gen-check-web/vitest.config.ts')).toContain('browser: true')
        expect(yield* read('packages/gen-check-both/vitest.config.ts')).toContain('browser: true')
        expect(yield* read('packages/gen-check-node/vitest.config.ts')).not.toContain('browser: true')

        const guards = yield* read('packages/publish/src/guards.ts')
        const fallow = yield* read('.fallowrc.json')
        expect(guards).toContain("'@conciv/gen-check-node',")
        expect(fallow).toContain('"@conciv/gen-check-node"')
        expect(guards).toContain("'@conciv/plugin-gen-check',")
        expect(fallow).toContain('"@conciv/plugin-gen-check"')
        expect(`${guards}${fallow}`).not.toMatch(/gen-check-(web|both)/)
        expect(yield* read('.changeset/add-gen-check-node-package.md')).toContain("'@conciv/gen-check-node': patch")

        yield* succeed(copy, path.join(copy, 'node_modules/.bin/oxfmt'), [
          '--check',
          'packages/gen-check-node',
          'packages/gen-check-web',
          'packages/gen-check-both',
          'packages/plugins/gen-check',
          'packages/publish/src/guards.ts',
          '.fallowrc.json',
        ])
      }).pipe(Effect.provide(NodeServices.layer)),
  )
})
