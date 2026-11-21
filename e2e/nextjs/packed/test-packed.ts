import {spawnSync} from 'node:child_process'
import {cpSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {emptyE2eState} from '@conciv/e2e-utils/config'
import {buildAndPack, installPacked, readManifest} from '@conciv/vitest-config/pack'
import {BUNDLERS, PACKED_ROOT, packedAppDir} from './packed-app-dir.ts'

const CONFIG_DIR = join(import.meta.dirname, '..')
const FIXTURE_APP = join(import.meta.dirname, 'app')
const TARBALL_DIR = join(PACKED_ROOT, 'tarballs')
const LOCK_PATH = join(import.meta.dirname, 'fixture-lock.yaml')
const CLOSURE_ROOTS = ['@conciv/it']
const APP_DEPENDENCIES = [...CLOSURE_ROOTS, 'next', 'react', 'react-dom']

function installedVersion(name: string): string {
  const {version} = readManifest(join(CONFIG_DIR, 'node_modules', name, 'package.json'))
  if (version === undefined) throw new Error(`e2e/nextjs has no installed version of ${name}`)
  return version
}

function writeApps(): void {
  const dependencies = Object.fromEntries(APP_DEPENDENCIES.map((name) => [name, installedVersion(name)]))
  for (const bundler of BUNDLERS) {
    cpSync(FIXTURE_APP, packedAppDir(bundler), {recursive: true})
    const manifest = {name: `nextjs-packed-${bundler}`, private: true, dependencies}
    writeFileSync(join(packedAppDir(bundler), 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
  writeFileSync(join(PACKED_ROOT, 'package.json'), `${JSON.stringify({name: 'nextjs-packed', private: true})}\n`)
}

rmSync(PACKED_ROOT, {recursive: true, force: true})
mkdirSync(TARBALL_DIR, {recursive: true})
emptyE2eState(CONFIG_DIR)
const {overrides} = await buildAndPack(TARBALL_DIR, CLOSURE_ROOTS)
writeApps()
await installPacked({
  root: PACKED_ROOT,
  packages: ['packages/*'],
  allowBuilds: {sharp: false, protobufjs: false},
  overrides,
  lockPath: LOCK_PATH,
})
const playwright = spawnSync(
  join(CONFIG_DIR, 'node_modules/.bin/playwright'),
  ['test', '--config', join(CONFIG_DIR, 'playwright.packed.config.ts'), ...process.argv.slice(2)],
  {cwd: CONFIG_DIR, stdio: 'inherit'},
)
if (playwright.error !== undefined) throw playwright.error
process.exitCode = playwright.status ?? 1
