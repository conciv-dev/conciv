import {spawnSync} from 'node:child_process'
import {cpSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {e2eDevEndpointDir} from '@internal/e2e-utils/dev-endpoint'
import {WORKSPACE_ROOT, buildAndPack, installPacked, readManifest} from '@internal/e2e-utils/pack'
import {PACKED_APP_DIR, PACKED_ROOT} from './packed-app-dir.ts'

const SOURCE_APP = join(WORKSPACE_ROOT, 'e2e/vite-react')
const SCAFFOLD_ENTRIES = ['index.html', 'src', 'public']
const CONSUMER_PACKAGES = ['@conciv/it', 'react', 'react-dom']
const VITE_TOOLING = ['vite', '@vitejs/plugin-react']
const TARBALL_DIR = join(PACKED_ROOT, 'tarballs')
const LOCK_PATH = join(import.meta.dirname, '..', 'fixture-lock.yaml')
const PACKED_CONFIG_DIR = join(import.meta.dirname, '..')
const DEV_ENDPOINT_ENV = 'CONCIV_E2E_DEV_ENDPOINT_DIR'
const VITE_CONFIG = `import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'

const devEndpointDir = process.env.${DEV_ENDPOINT_ENV}
if (!devEndpointDir) throw new Error('${DEV_ENDPOINT_ENV} is not set; run this app through test-packed.ts')

export default defineConfig({
  plugins: [react(), conciv({devEndpointDir})],
})
`

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
  const names = [...CONSUMER_PACKAGES, ...VITE_TOOLING]
  return Object.fromEntries(names.map((name) => [name, installedVersion(name)]))
}

function writeConsumer(): void {
  for (const entry of SCAFFOLD_ENTRIES) {
    cpSync(join(SOURCE_APP, entry), join(PACKED_APP_DIR, entry), {recursive: true})
  }
  const manifest = {name: 'vite-react-packed', private: true, type: 'module', dependencies: consumerDependencies()}
  writeFileSync(join(PACKED_APP_DIR, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(PACKED_APP_DIR, 'vite.config.ts'), VITE_CONFIG)
}

rmSync(PACKED_ROOT, {recursive: true, force: true})
mkdirSync(TARBALL_DIR, {recursive: true})
mkdirSync(PACKED_APP_DIR, {recursive: true})
const {overrides} = await timed('pack', () => buildAndPack(TARBALL_DIR, CONSUMER_PACKAGES))
writeConsumer()
await timed('install', () =>
  installPacked({
    root: PACKED_APP_DIR,
    packages: ['.'],
    allowBuilds: {protobufjs: false},
    overrides,
    lockPath: LOCK_PATH,
  }),
)
const playwright = spawnSync(
  join(import.meta.dirname, '..', 'node_modules/.bin/playwright'),
  ['test', '--config', join(import.meta.dirname, '..', 'playwright.config.ts'), ...process.argv.slice(2)],
  {
    cwd: PACKED_APP_DIR,
    stdio: 'inherit',
    env: {...process.env, [DEV_ENDPOINT_ENV]: e2eDevEndpointDir(PACKED_CONFIG_DIR)},
  },
)
if (playwright.error !== undefined) throw playwright.error
process.exitCode = playwright.status ?? 1
