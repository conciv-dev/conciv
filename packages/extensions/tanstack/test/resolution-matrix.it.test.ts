import {execFileSync} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import ts from 'typescript'
import {afterAll, beforeAll, describe, expect, test} from 'vitest'

const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url))

const concivPackageDirs = [
  'packages/extensions/tanstack',
  'packages/extension',
  'packages/contract',
  'packages/grab',
  'packages/page',
  'packages/protocol',
  'packages/solid-streamdown',
  'packages/ui-kit-chat',
  'packages/ui-kit-system',
]

const rootPackage = '@conciv/extension-tanstack'

type PackedPackage = {name: string; version: string; tarball: string}

type Fixture = {dir: string; packDir: string; packed: PackedPackage[]}

const ctx: {fixture?: Fixture} = {}

function readManifest(dir: string): {name: string; version: string} {
  const raw: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  if (typeof raw !== 'object' || raw === null || !('name' in raw) || !('version' in raw)) {
    throw new Error(`invalid manifest at ${dir}`)
  }
  const {name, version} = raw
  if (typeof name !== 'string' || typeof version !== 'string') throw new Error(`invalid name/version at ${dir}`)
  return {name, version}
}

function tarballSlug(name: string, version: string): string {
  return `${name.replace('@', '').replace('/', '-')}-${version}.tgz`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function packWorkspaceClosure(packDir: string): PackedPackage[] {
  const packed: PackedPackage[] = []
  for (const relative of concivPackageDirs) {
    const packageDir = join(workspaceRoot, relative)
    const {name, version} = readManifest(packageDir)
    execFileSync('pnpm', ['pack', '--pack-destination', packDir], {cwd: packageDir, stdio: 'pipe'})
    const slug = tarballSlug(name, version)
    const tarball = join(packDir, slug)
    const manifestText = execFileSync('tar', ['-xzOf', tarball, 'package/package.json']).toString()
    expect(manifestText, `${name} tarball must not carry workspace protocol`).not.toContain('workspace:')
    packed.push({name, version, tarball})
  }
  return packed
}

function writeFixtureManifest(dir: string, packed: PackedPackage[]): void {
  const root = packed.find((entry) => entry.name === rootPackage)
  if (!root) throw new Error('root package missing from closure')
  const manifest = {
    name: 'conciv-resolution-matrix-fixture',
    version: '0.0.0',
    private: true,
    type: 'module',
    dependencies: {
      [rootPackage]: `file:${root.tarball}`,
      '@tanstack/react-router': '^1.170.0',
      'solid-js': '^1.9.13',
    },
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
  const overrideLines = packed.map((entry) => `  '${entry.name}': 'file:${entry.tarball}'`)
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), ['overrides:', ...overrideLines, ''].join('\n'))
}

function buildFixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-resolution-matrix-'))
  const packDir = mkdtempSync(join(tmpdir(), 'conciv-resolution-packs-'))
  const packed = packWorkspaceClosure(packDir)
  writeFixtureManifest(dir, packed)
  execFileSync('pnpm', ['install', '--no-frozen-lockfile'], {cwd: dir, stdio: 'pipe'})
  return {dir, packDir, packed}
}

function fixture(): Fixture {
  if (!ctx.fixture) throw new Error('fixture not built')
  return ctx.fixture
}

beforeAll(() => {
  ctx.fixture = buildFixture()
}, 420_000)

afterAll(() => {
  if (!ctx.fixture) return
  rmSync(ctx.fixture.dir, {recursive: true, force: true})
  rmSync(ctx.fixture.packDir, {recursive: true, force: true})
})

describe('resolution matrix', () => {
  test('fixture install resolves every @conciv package from file tarballs only', () => {
    const {dir, packed} = fixture()
    const lock = readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')
    for (const entry of packed) {
      expect(lock, `${entry.name} must resolve via file: in the lockfile`).toContain(`${entry.name}@file:`)
      const registryVersion = new RegExp(`${escapeRegExp(entry.name)}@\\d`)
      expect(registryVersion.test(lock), `${entry.name} must not resolve from the registry`).toBe(false)
    }
    expect(lock).not.toContain('registry.npmjs.org/@conciv')
  })

  test('node default conditions resolve and execute the server entry', () => {
    const {dir} = fixture()
    const probe = join(dir, 'node-probe.mjs')
    writeFileSync(
      probe,
      [
        `import m from '${rootPackage}'`,
        `const resolved = import.meta.resolve('${rootPackage}')`,
        `process.stdout.write(JSON.stringify({resolved, name: m.name}))`,
      ].join('\n'),
    )
    const output = execFileSync('node', [probe], {cwd: dir}).toString()
    const parsed: unknown = JSON.parse(output)
    if (typeof parsed !== 'object' || parsed === null || !('resolved' in parsed) || !('name' in parsed)) {
      throw new Error('probe produced no result')
    }
    const {resolved, name} = parsed
    if (typeof resolved !== 'string') throw new Error('resolved path missing')
    expect(fileURLToPath(resolved).endsWith(join('dist', 'server.js'))).toBe(true)
    expect(name).toBe('tanstack')
  })

  test('vite client and ssr resolves split browser and node conditions', async () => {
    const {dir} = fixture()
    const importer = join(dir, 'importer.tsx')
    const server = await createServer({
      root: dir,
      configFile: false,
      logLevel: 'silent',
      server: {middlewareMode: true, ws: false},
      optimizeDeps: {noDiscovery: true, include: []},
    })
    try {
      const client = await server.pluginContainer.resolveId(rootPackage, importer, {ssr: false})
      const ssr = await server.pluginContainer.resolveId(rootPackage, importer, {ssr: true})
      if (!client || !ssr) throw new Error('vite failed to resolve the extension')
      expect(client.id.endsWith(join('dist', 'client.js'))).toBe(true)
      expect(ssr.id.endsWith(join('dist', 'server.js'))).toBe(true)
    } finally {
      await server.close()
    }
  })

  test('typescript resolves types by customConditions', () => {
    const {dir} = fixture()
    const containingFile = join(dir, 'index.ts')
    const baseOptions = {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    }
    const defaultResult = ts.resolveModuleName(rootPackage, containingFile, baseOptions, ts.sys)
    const browserResult = ts.resolveModuleName(
      rootPackage,
      containingFile,
      {...baseOptions, customConditions: ['browser']},
      ts.sys,
    )
    const defaultTypes = defaultResult.resolvedModule?.resolvedFileName
    const browserTypes = browserResult.resolvedModule?.resolvedFileName
    if (!defaultTypes || !browserTypes) throw new Error('typescript failed to resolve types')
    expect(defaultTypes.endsWith(join('dist', 'server.d.ts'))).toBe(true)
    expect(browserTypes.endsWith(join('dist', 'client.d.ts'))).toBe(true)
  })
})
