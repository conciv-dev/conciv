import fs from 'fs/promises'
import path from 'path'
import {pathToFileURL} from 'url'
import {NodeFileSystem} from '@effect/platform-node'
import {describe, expect, test} from 'vitest'
import {Effect, Layer} from 'effect'
import {EffectFlock} from '../../src/util/effect-flock.js'
import {FSUtil} from '../../src/util/fs-util.js'
import {Global} from '../../src/util/global.js'
import {Npm} from '../../src/util/npm.js'
import {tmpdir} from './fixture/tmpdir'

const win = process.platform === 'win32'

const writePackage = (dir: string, pkg: Record<string, unknown>) =>
  fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      version: '1.0.0',
      ...pkg,
    }),
  )

const npmLayer = (cache: string) =>
  Npm.layer.pipe(
    Layer.provide(EffectFlock.layer),
    Layer.provide(Global.layerWith({cache, state: path.join(cache, 'state')})),
    Layer.provide(FSUtil.layer),
    Layer.provide(NodeFileSystem.layer),
  )

describe('Npm.sanitize', () => {
  test('keeps normal scoped package specs unchanged', () => {
    expect(Npm.sanitize('@opencode/acme')).toBe('@opencode/acme')
    expect(Npm.sanitize('@opencode/acme@1.0.0')).toBe('@opencode/acme@1.0.0')
    expect(Npm.sanitize('prettier')).toBe('prettier')
  })

  test('handles git https specs', () => {
    const spec = 'acme@git+https://github.com/opencode/acme.git'
    const expected = win ? 'acme@git+https_//github.com/opencode/acme.git' : spec
    expect(Npm.sanitize(spec)).toBe(expected)
  })
})

describe('Npm.isRegistryPackage', () => {
  test('accepts registry packages and rejects unsupported install targets', async () => {
    expect(await Npm.isRegistryPackage('plugin')).toBe(true)
    expect(await Npm.isRegistryPackage('@acme/plugin@beta')).toBe(true)
    expect(await Npm.isRegistryPackage('plugin@^1.2.0')).toBe(true)
    expect(await Npm.isRegistryPackage('./plugin')).toBe(false)
    expect(await Npm.isRegistryPackage('github:acme/plugin')).toBe(false)
    expect(await Npm.isRegistryPackage('alias@npm:plugin@1.0.0')).toBe(false)
  })
})

describe('Npm.isInstallablePackage', () => {
  test('accepts registry and npm-compatible Git specs', async () => {
    expect(await Npm.isInstallablePackage('plugin@^1.2.0')).toBe(true)
    expect(await Npm.isInstallablePackage('github:acme/plugin#main')).toBe(true)
    expect(await Npm.isInstallablePackage('git+ssh://git@github.com/acme/plugin.git#main')).toBe(true)
    expect(await Npm.isInstallablePackage('git@github.com:acme/plugin.git')).toBe(true)
    expect(
      await Npm.isInstallablePackage(
        'git+https://github.com/acme/plugins.git#0123456789abcdef0123456789abcdef01234567::path:packages/plugin',
      ),
    ).toBe(true)
    expect(await Npm.isInstallablePackage('./plugin')).toBe(false)
    expect(await Npm.isInstallablePackage('https://example.com/plugin.tgz')).toBe(false)
    expect(await Npm.isInstallablePackage('alias@npm:plugin@1.0.0')).toBe(false)
  })
})

describe('Npm.cacheKey', () => {
  test('canonicalizes registry keys and hashes Git specs', async () => {
    expect(await Npm.cacheKey('@opencode/acme@1.0.0')).toBe(Npm.sanitize('@opencode/acme@1.0.0'))
    expect(await Npm.cacheKey('plugin')).toBe(Npm.sanitize('plugin@latest'))
    expect(await Npm.cacheKey('@opencode/acme')).toBe(Npm.sanitize('@opencode/acme@latest'))
    const spec = 'git+ssh://git@github.com/acme/plugin.git#main'
    expect(await Npm.cacheKey(spec)).toMatch(/^git-plugin-[a-f0-9]{12}$/)
    expect(await Npm.cacheKey(spec)).toBe(await Npm.cacheKey(spec))
    expect(await Npm.cacheKey(`${spec}-other`)).not.toBe(await Npm.cacheKey(spec))
  })
})

describe('Npm.add', () => {
  test('locates cached scoped package specs without reifying', async () => {
    await using tmp = await tmpdir()
    const spec = '@fixture/provider@1.0.0'
    const directory = path.join(
      tmp.path,
      'cache',
      'npm',
      await Npm.cacheKey(spec),
      '1000',
      'node_modules',
      '@fixture',
      'provider',
    )
    await fs.mkdir(directory, {recursive: true})
    await writePackage(directory, {name: '@fixture/provider', exports: './index.js'})
    await fs.writeFile(path.join(directory, 'index.js'), 'export const fixture = true\n')

    const entry = await Effect.gen(function* () {
      const npm = yield* Npm.Service
      return yield* npm.add(spec)
    }).pipe(Effect.scoped, Effect.provide(npmLayer(path.join(tmp.path, 'cache'))), Effect.runPromise)

    expect(entry.directory).toBe(directory)
    expect(entry.name).toBe('@fixture/provider')
  })

  test('reifies when package cache directory exists without the package installed', async () => {
    await using tmp = await tmpdir()
    await fs.mkdir(path.join(tmp.path, 'fixture-provider'))
    await writePackage(path.join(tmp.path, 'fixture-provider'), {
      name: 'fixture-provider',
      exports: {
        '.': './index.js',
        './tui': './tui.js',
      },
    })
    await fs.writeFile(path.join(tmp.path, 'fixture-provider', 'index.js'), 'export const fixture = true\n')
    await fs.writeFile(path.join(tmp.path, 'fixture-provider', 'tui.js'), 'export const tui = true\n')

    const spec = `fixture-provider@file:${path.join(tmp.path, 'fixture-provider')}`
    await fs.mkdir(path.join(tmp.path, 'cache', 'npm', Npm.sanitize(spec)), {recursive: true})

    const entries = await Effect.gen(function* () {
      const npm = yield* Npm.Service
      return {
        added: yield* npm.add(spec),
        cached: yield* npm.add(spec),
      }
    }).pipe(Effect.scoped, Effect.provide(npmLayer(path.join(tmp.path, 'cache'))), Effect.runPromise)

    expect(await fs.stat(path.join(entries.added.directory, 'package.json'))).toBeTruthy()
    expect(entries.cached).toEqual(entries.added)
  })

  test("reports Git's own error when a Git package cannot be fetched", async () => {
    await using tmp = await tmpdir()
    const spec = `git+${pathToFileURL(path.join(tmp.path, 'missing')).href}`

    const error = await Effect.gen(function* () {
      const npm = yield* Npm.Service
      return yield* npm.add(spec).pipe(Effect.flip)
    }).pipe(Effect.scoped, Effect.provide(npmLayer(path.join(tmp.path, 'cache'))), Effect.runPromise)

    expect(error.message).toContain(`Failed to install ${spec}`)
    expect(error.message).toContain('does not appear to be a git repository')
  }, 30_000)
})

describe('Npm.resolve', () => {
  test('locates a cached package without installing it', async () => {
    await using tmp = await tmpdir()
    const cache = path.join(tmp.path, 'cache')
    const spec = 'fixture-plugin@1.0.0'
    const directory = path.join(cache, 'npm', Npm.sanitize(spec), '1000', 'node_modules', 'fixture-plugin')
    const missing = await Effect.gen(function* () {
      const npm = yield* Npm.Service
      return yield* npm.resolve(spec)
    }).pipe(Effect.scoped, Effect.provide(npmLayer(cache)), Effect.runPromise)
    expect(missing.version).toBeUndefined()

    await fs.mkdir(directory, {recursive: true})
    await writePackage(directory, {
      name: 'fixture-plugin',
      exports: {'.': './index.js', './tui': './tui.js'},
    })
    await fs.writeFile(path.join(directory, 'index.js'), 'export default {}\n')
    await fs.writeFile(path.join(directory, 'tui.js'), 'export default {}\n')

    const resolved = await Effect.gen(function* () {
      const npm = yield* Npm.Service
      return yield* npm.resolve(spec)
    }).pipe(Effect.scoped, Effect.provide(npmLayer(cache)), Effect.runPromise)
    expect(resolved.directory).toBe(directory)
    expect(resolved.version).toBe('1.0.0')
  })
})
