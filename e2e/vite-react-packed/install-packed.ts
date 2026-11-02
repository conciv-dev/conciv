import {copyFileSync, cpSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {E2E_DEV_ENDPOINT_DIR} from '@conciv/e2e-utils/dev-endpoint'
import {WORKSPACE_ROOT, buildAndPack, installPacked, readManifest} from '@conciv/e2e-utils/packed'
import {PACKED_APP_DIR, PACKED_ROOT} from './packed-app-dir.ts'

const SOURCE_APP = join(WORKSPACE_ROOT, 'e2e/vite-react')
const SCAFFOLD_ENTRIES = ['index.html', 'src', 'public']
const VITE_TOOLING = ['vite', '@vitejs/plugin-react']
const TARBALL_DIR = join(PACKED_ROOT, 'tarballs')
const LOCK = {
  path: join(import.meta.dirname, 'fixture-lock.yaml'),
  updateCommand: 'pnpm --filter conciv-e2e-vite-react-packed run update-packed-lockfile',
}

async function timed<T>(label: string, step: () => Promise<T>): Promise<T> {
  const started = performance.now()
  const result = await step()
  console.log(`[vite-react-packed] ${label}: ${((performance.now() - started) / 1000).toFixed(1)}s`)
  return result
}

function installedVersion(name: string): string {
  const {version} = readManifest(join(SOURCE_APP, 'node_modules', name, 'package.json'))
  if (version === undefined) throw new Error(`e2e/vite-react has no installed version of ${name}`)
  return version
}

function consumerDependencies(): Record<string, string> {
  const names = [...Object.keys(readManifest(join(SOURCE_APP, 'package.json')).dependencies ?? {}), ...VITE_TOOLING]
  return Object.fromEntries(names.map((name) => [name, installedVersion(name)]))
}

function viteConfigSource(): string {
  return [
    `import {defineConfig} from 'vite'`,
    `import react from '@vitejs/plugin-react'`,
    `import conciv from '@conciv/it/plugin/vite'`,
    ``,
    `export default defineConfig({`,
    `  plugins: [react(), conciv({devEndpointDir: ${JSON.stringify(E2E_DEV_ENDPOINT_DIR)}})],`,
    `})`,
    ``,
  ].join('\n')
}

function writeConsumer(): void {
  for (const entry of SCAFFOLD_ENTRIES) {
    cpSync(join(SOURCE_APP, entry), join(PACKED_APP_DIR, entry), {recursive: true})
  }
  const manifest = {name: 'vite-react-packed', private: true, type: 'module', dependencies: consumerDependencies()}
  writeFileSync(join(PACKED_APP_DIR, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(PACKED_APP_DIR, 'vite.config.ts'), viteConfigSource())
}

const updateLockfile = process.argv.includes('--update-lockfile')
rmSync(PACKED_ROOT, {recursive: true, force: true})
mkdirSync(TARBALL_DIR, {recursive: true})
mkdirSync(PACKED_APP_DIR, {recursive: true})
const {overrides} = await timed('pack', () => buildAndPack(TARBALL_DIR, ['@conciv/it']))
writeConsumer()
await timed('install', () =>
  installPacked({
    root: PACKED_APP_DIR,
    packages: ['.'],
    allowBuilds: {'isolated-vm': false, protobufjs: false},
    overrides,
    lock: LOCK,
    fresh: updateLockfile,
  }),
)
if (updateLockfile) copyFileSync(join(PACKED_APP_DIR, 'pnpm-lock.yaml'), LOCK.path)
