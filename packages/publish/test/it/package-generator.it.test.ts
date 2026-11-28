import * as NodeServices from '@effect/platform-node/NodeServices'
import {describe, expect, it} from '@effect/vitest'
import {Effect, FileSystem, Path} from 'effect'
import {ChildProcess, ChildProcessSpawner} from 'effect/process'
import nodePlop from 'node-plop'
import {tempDir} from '@internal/vitest-config/temp-dir'

describe('turbo gen package', () => {
  const REPO = new URL('../../../../', import.meta.url).pathname
  const PLOPFILE = new URL('../../turbo/generators/config.ts', import.meta.url).pathname
  const FIXTURE = new URL('../fixtures/generator-root', import.meta.url).pathname
  const LINKED = ['node_modules', '.oxfmtrc.json']
  const TEST_FOLDERS = ['e2e', 'fixtures', 'it', 'unit', 'utils'].map((folder) => `test/${folder}/.gitkeep`)
  const SOURCE_FILES = ['README.md', 'package.json', 'tsconfig.json', 'vitest.config.ts', ...TEST_FOLDERS]
  const BUILT_FILES = [...SOURCE_FILES, 'tsconfig.build.json', 'tsdown.config.ts']

  const listFiles = Effect.fn('listFiles')(function* (folder: string) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const entries = yield* fs.readDirectory(folder, {recursive: true})
    const files = yield* Effect.filter(entries, (entry) =>
      fs.stat(path.join(folder, entry)).pipe(Effect.map((info) => info.type === 'File')),
    )
    return files.toSorted()
  })

  const listEntries = Effect.fn('listEntries')(function* (folder: string) {
    const fs = yield* FileSystem.FileSystem
    return (yield* fs.readDirectory(folder)).toSorted()
  })

  const readJson = Effect.fn('readJson')(function* (file: string) {
    const fs = yield* FileSystem.FileSystem
    const parsed: unknown = JSON.parse(yield* fs.readFileString(file))
    return parsed
  })

  const generatorRoot = Effect.fn('generatorRoot')(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = path.join(tempDir('package-generator-'), 'repo')
    yield* fs.copy(FIXTURE, root)
    for (const linked of LINKED) yield* fs.symlink(path.join(REPO, linked), path.join(root, linked))
    return root
  })

  const checkFormat = Effect.fn('checkFormat')(function* (root: string, paths: string[]) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    return yield* spawner.exitCode(
      ChildProcess.make(`${root}/node_modules/.bin/oxfmt`, ['--check', ...paths], {cwd: root, extendEnv: true}),
    )
  })

  it.live(
    'makes each kind of package, edits the shared files for a published one or a plugin and refuses bad answers',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const root = yield* generatorRoot()
        const packages = path.join(root, 'packages')
        const read = (file: string) => fs.readFileString(path.join(root, file))
        const plop = yield* Effect.promise(() => nodePlop(PLOPFILE))
        const generator = plop.getGenerator('package')
        const generate = (kind: string, name: string, description: string, runtime: string) =>
          Effect.promise(() =>
            generator.runActions({kind, name, description, runtime, install: 'skip', turbo: {paths: {root}}}),
          )
        const firstFailure = (kind: string, name: string, runtime: string) =>
          generate(kind, name, 'x', runtime).pipe(Effect.map(({failures}) => failures.at(0)?.error))

        const prompts = Array.isArray(generator.prompts) ? generator.prompts : []
        const validate = (name: string, input: string) =>
          prompts.find((prompt) => prompt.name === name)?.validate?.(input)
        expect(validate('name', 'gen-check')).toBe(true)
        expect(validate('name', 'Bad')).toContain('use kebab-case')
        expect(validate('description', 'One line.')).toBe(true)
        expect(validate('description', 'two\nlines')).toBe('write one line that says what the package is for')

        const results = [
          yield* generate('published', 'gen-check-node', 'A published node package the generator test made.', 'node'),
          yield* generate('plugin', 'gen-check', 'A plugin the generator test made.', 'both'),
          yield* generate(
            'internal',
            'gen-check-web',
            'An internal browser package the generator test made.',
            'browser',
          ),
          yield* generate('internal', 'gen-check-both', 'An internal package the generator test made.', 'both'),
        ]
        expect(results.map(({failures}) => failures)).toEqual([[], [], [], []])

        expect(yield* firstFailure('plugin', 'plugin-experimental', 'both')).toContain(
          'a plugin with both parts cannot be named plugin-experimental',
        )
        expect(yield* firstFailure('private', 'gen-check-bad', 'node')).toBe(
          'Expected "published" | "internal" | "plugin"\n  at ["kind"]',
        )
        expect(yield* firstFailure('published', 'Bad', 'node')).toBe(
          'Expected a string matching the RegExp ^[a-z][a-z0-9]*(-[a-z0-9]+)*$\n  at ["name"]',
        )
        expect(yield* firstFailure('published', 'plugin-page', 'node')).toContain(
          '@conciv/plugin-page is already declared by packages/plugins/page',
        )
        expect(yield* firstFailure('internal', 'plugins', 'node')).toContain('packages/plugins already exists')

        expect(yield* listEntries(packages)).toEqual([
          'gen-check-both',
          'gen-check-node',
          'gen-check-web',
          'it',
          'plugins',
        ])
        expect(yield* listEntries(path.join(packages, 'plugins'))).toEqual(['gen-check', 'page'])
        expect(yield* listEntries(path.join(root, '.changeset'))).toEqual([
          '.gitkeep',
          'add-gen-check-node-package.md',
          'add-gen-check-package.md',
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
          engines: {node: '>=26'},
        })
        expect(yield* read('packages/plugins/gen-check/vite.config.ts')).toContain('experimental()')
        expect(yield* read('packages/plugins/gen-check/src/plugin-experimental.tsx')).toContain("'./.generated/css.js'")

        const publishedManifest = yield* readJson(path.join(packages, 'gen-check-node/package.json'))
        expect(publishedManifest).toMatchObject({
          name: '@conciv/gen-check-node',
          version: '0.0.23',
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

        const fallow = yield* read('.fallowrc.json')
        expect(fallow).toContain('"@conciv/gen-check-node"')
        expect(fallow).toContain('"@conciv/plugin-gen-check"')
        expect(fallow).not.toMatch(/gen-check-(web|both)/)
        expect(yield* read('.changeset/add-gen-check-node-package.md')).toContain("'@conciv/gen-check-node': patch")

        expect(
          yield* checkFormat(root, [
            'packages/gen-check-node',
            'packages/gen-check-web',
            'packages/gen-check-both',
            'packages/plugins/gen-check',
            '.fallowrc.json',
          ]),
        ).toBe(0)
      }).pipe(Effect.provide(NodeServices.layer)),
  )
})
