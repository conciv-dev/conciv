import * as NodeServices from '@effect/platform-node/NodeServices'
import {describe, expect, it} from '@effect/vitest'
import {Effect, FileSystem, Path} from 'effect'
import {ChildProcess, ChildProcessSpawner} from 'effect/process'
import {tempDir} from '@internal/vitest-config/temp-dir'

describe('turbo gen package', () => {
  const GENERATORS = 'packages/publish/turbo/generators'
  const LINKED_DEPENDENCIES = ['node_modules', 'packages/publish/node_modules']
  const BUILT_FILES = [
    'README.md',
    'package.json',
    'tsconfig.build.json',
    'tsconfig.json',
    'tsdown.config.ts',
    'vite.config.ts',
  ]

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

  it.live('makes each kind of package, edits the shared files for a published one and refuses bad answers', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const copy = yield* throwawayWorktree()
      const packages = path.join(copy, 'packages')
      const read = (file: string) => fs.readFileString(path.join(copy, file))
      const generate = (...answers: string[]) =>
        output(copy, path.join(copy, 'node_modules/.bin/turbo'), ['gen', 'package', '--args', ...answers])

      const [
        publishedOutput,
        privateOutput,
        internalOutput,
        unknownKindOutput,
        badNameOutput,
        declaredNameOutput,
        existingFolderOutput,
      ] = yield* Effect.all(
        [
          generate('published', 'gen-check-node', 'A published node package the generator test made.', 'node', 'skip'),
          generate('private', 'gen-check-web', 'A private browser package the generator test made.', 'browser', 'skip'),
          generate('internal', 'gen-check-both', 'An internal package the generator test made.', 'both', 'skip'),
          generate('public', 'gen-check-bad', 'x', 'node', 'skip'),
          generate('published', 'Bad', 'x', 'node', 'skip'),
          generate('published', 'plugin-page', 'x', 'node', 'skip'),
          generate('private', 'opaque-internal', 'x', 'node', 'skip'),
        ],
        {concurrency: 'unbounded'},
      )

      expect([publishedOutput, privateOutput, internalOutput]).toEqual([
        expect.stringContaining('Success'),
        expect.stringContaining('Success'),
        expect.stringContaining('Success'),
      ])
      expect(badNameOutput).toContain('use kebab-case')
      expect(unknownKindOutput).toContain('did not recognize')
      expect(declaredNameOutput).toContain('@conciv/plugin-page is already declared by packages/plugins/page')
      expect(existingFolderOutput).toContain('packages/opaque-internal already exists')
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
        '?? packages/gen-check-both-internal/',
        '?? packages/gen-check-node/',
        '?? packages/gen-check-web/',
      ])

      expect(yield* listFiles(path.join(packages, 'gen-check-node'))).toEqual(
        [...BUILT_FILES, 'src/gen-check-node.ts'].toSorted(),
      )
      expect(yield* listFiles(path.join(packages, 'gen-check-web'))).toEqual(
        [...BUILT_FILES, 'src/gen-check-web.ts'].toSorted(),
      )
      expect(yield* listFiles(path.join(packages, 'gen-check-both-internal'))).toEqual(
        ['README.md', 'package.json', 'src/gen-check-both.ts', 'tsconfig.json', 'vite.config.ts'].toSorted(),
      )

      const publishedManifest = yield* readJson(path.join(packages, 'gen-check-node/package.json'))
      expect(publishedManifest).toMatchObject({
        name: '@conciv/gen-check-node',
        publishConfig: {access: 'public'},
        exports: {'.': {types: './dist/gen-check-node.d.ts', import: './dist/gen-check-node.js'}},
        scripts: {build: expect.any(String), publint: 'publint', attw: expect.any(String)},
        devDependencies: {'@types/node': 'catalog:'},
      })
      expect(publishedManifest).not.toHaveProperty('private')
      const privateManifest = yield* readJson(path.join(packages, 'gen-check-web/package.json'))
      expect(privateManifest).toMatchObject({
        name: '@conciv/gen-check-web',
        private: true,
        scripts: {build: expect.any(String)},
      })
      expect(privateManifest).not.toHaveProperty('publishConfig')
      expect(privateManifest).not.toHaveProperty('scripts.publint')
      expect(privateManifest).not.toHaveProperty(['devDependencies', '@types/node'])
      const internalManifest = yield* readJson(path.join(packages, 'gen-check-both-internal/package.json'))
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

      expect(yield* read('packages/gen-check-node/tsdown.config.ts')).toContain("entry: ['src/gen-check-node.ts']")
      expect(yield* read('packages/gen-check-node/tsconfig.json')).toContain('tsconfig.base.json')
      expect(yield* read('packages/gen-check-web/tsconfig.json')).toContain('tsconfig.web.json')
      expect(yield* read('packages/gen-check-both-internal/tsconfig.json')).toMatch(/tsconfig\.web\.json[\s\S]*"node"/)

      const guards = yield* read('packages/publish/src/guards.ts')
      const fallow = yield* read('.fallowrc.json')
      expect(guards).toContain("'@conciv/gen-check-node',")
      expect(fallow).toContain('"@conciv/gen-check-node"')
      expect(`${guards}${fallow}`).not.toMatch(/gen-check-(web|both)/)
      expect(yield* read('.changeset/add-gen-check-node-package.md')).toContain("'@conciv/gen-check-node': patch")

      yield* succeed(copy, path.join(copy, 'node_modules/.bin/oxfmt'), [
        '--check',
        'packages/gen-check-node',
        'packages/gen-check-web',
        'packages/gen-check-both-internal',
        'packages/publish/src/guards.ts',
        '.fallowrc.json',
      ])
    }).pipe(Effect.provide(NodeServices.layer)),
  )
})
