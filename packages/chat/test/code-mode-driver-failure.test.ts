import {spawnSync} from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll, describe, expect, test} from 'vitest'
import {z} from 'zod'
import {driverCandidates} from '../src/code-mode.js'

const OutcomeSchema = z.object({
  firstAvailable: z.boolean(),
  secondAvailable: z.boolean(),
  executed: z.unknown(),
})

const chatPackageDir = fileURLToPath(new URL('..', import.meta.url))
const chatRequire = createRequire(join(chatPackageDir, 'entry.js'))
const aiPackageDir = realpathSync(join(chatPackageDir, 'node_modules', '@conciv', 'ai'))
const [nativeDriver, wasmDriver] = driverCandidates
const nativeDriverPath = (nativeDriver?.name ?? '').split('/')

const probeScript = `
import {pathToFileURL} from 'node:url'
import {z} from 'zod'
const {makeCodeMode} = await import(pathToFileURL(process.argv[2]).href)
const capabilities = () => [
  {
    name: 'noop',
    description: 'a capability that does nothing at all',
    summary: 'does nothing',
    category: 'test',
    mutating: false,
    reachable: true,
    inputSchema: z.object({}),
    errors: [],
    signature: () => ({input: {type: 'object', properties: {}}}),
    execute: async () => ({ok: true}),
  },
]
const request = {sessionId: 'conciv_probe', model: null}
const gate = {decide: async () => 'allow'}
const first = await makeCodeMode(capabilities, request.sessionId, request, gate, {listening: () => true})
const second = await makeCodeMode(capabilities, request.sessionId, request, gate, {listening: () => true})
const executed = first === null ? null : await first.run('return 6 * 7')
console.log(JSON.stringify({firstAvailable: first !== null, secondAvailable: second !== null, executed}))
`

function corruptNativeAddons(prebuildsDir: string): void {
  let corrupted = 0
  for (const platform of readdirSync(prebuildsDir)) {
    const platformDir = join(prebuildsDir, platform)
    for (const file of readdirSync(platformDir)) {
      if (!file.endsWith('.node')) continue
      writeFileSync(join(platformDir, file), 'garbage bytes, not a native addon')
      corrupted += 1
    }
  }
  if (corrupted === 0) throw new Error(`no native addons found under ${prebuildsDir}`)
}

const skippedPackages = new Set(['@conciv/ai', nativeDriver?.name])

function linkPackage(source: string, target: string, name: string): void {
  if (skippedPackages.has(name) || existsSync(target)) return
  symlinkSync(source, target)
}

function linkDependencies(sourceModulesDir: string, targetModulesDir: string): void {
  for (const entry of readdirSync(sourceModulesDir)) {
    if (entry.startsWith('.')) continue
    if (!entry.startsWith('@')) {
      linkPackage(join(sourceModulesDir, entry), join(targetModulesDir, entry), entry)
      continue
    }
    mkdirSync(join(targetModulesDir, entry), {recursive: true})
    for (const scoped of readdirSync(join(sourceModulesDir, entry))) {
      const name = `${entry}/${scoped}`
      linkPackage(join(sourceModulesDir, entry, scoped), join(targetModulesDir, entry, scoped), name)
    }
  }
}

function copyAiPackage(modulesDir: string): void {
  const target = join(modulesDir, '@conciv', 'ai')
  mkdirSync(target, {recursive: true})
  cpSync(join(aiPackageDir, 'package.json'), join(target, 'package.json'))
  cpSync(join(aiPackageDir, 'dist'), join(target, 'dist'), {recursive: true})
}

function buildCorruptedTree(): {rootDir: string; codeModePath: string} {
  const rootDir = mkdtempSync(join(tmpdir(), 'conciv-broken-isolate-'))
  const modulesDir = join(rootDir, 'node_modules')
  mkdirSync(modulesDir)
  linkDependencies(join(chatPackageDir, 'node_modules'), modulesDir)
  linkDependencies(join(aiPackageDir, 'node_modules'), modulesDir)
  copyAiPackage(modulesDir)
  const isolateDir = realpathSync(join(aiPackageDir, 'node_modules', ...nativeDriverPath))
  cpSync(isolateDir, join(modulesDir, ...nativeDriverPath), {recursive: true})
  const isolatedVmDir = dirname(createRequire(join(isolateDir, 'entry.js')).resolve('isolated-vm'))
  cpSync(isolatedVmDir, join(modulesDir, 'isolated-vm'), {recursive: true})
  const gypBuildDir = dirname(createRequire(join(isolatedVmDir, 'entry.js')).resolve('node-gyp-build'))
  symlinkSync(gypBuildDir, join(modulesDir, 'node-gyp-build'))
  corruptNativeAddons(join(modulesDir, 'isolated-vm', 'prebuilds'))
  cpSync(join(chatPackageDir, 'src'), join(rootDir, 'pkg', 'src'), {recursive: true})
  const manifest = {name: 'chat-src-copy', private: true, type: 'module'}
  writeFileSync(join(rootDir, 'pkg', 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(rootDir, 'probe.mjs'), probeScript)
  return {rootDir, codeModePath: join(rootDir, 'pkg', 'src', 'code-mode.ts')}
}

describe('driver load failure', () => {
  let rootDir = ''
  let codeModePath = ''

  beforeAll(() => {
    const tree = buildCorruptedTree()
    rootDir = tree.rootDir
    codeModePath = tree.codeModePath
  })

  afterAll(() => {
    rmSync(rootDir, {recursive: true, force: true})
  })

  test('a genuinely broken native addon falls back to the wasm driver, which runs code', () => {
    const result = spawnSync(
      process.execPath,
      [chatRequire.resolve('tsx/cli'), join(rootDir, 'probe.mjs'), codeModePath],
      {encoding: 'utf8', timeout: 45_000, cwd: rootDir},
    )
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    const lastLine = result.stdout.trim().split('\n').at(-1) ?? ''
    const outcome = OutcomeSchema.parse(JSON.parse(lastLine))
    expect(outcome.firstAvailable).toBe(true)
    expect(outcome.secondAvailable).toBe(true)
    expect(JSON.stringify(outcome.executed)).toContain('42')
    const failedMarker = `[core] the code mode driver ${nativeDriver?.name} is unusable`
    expect(result.stderr.split(failedMarker).length - 1).toBe(1)
    const chosenMarker = `[core] code mode is running on ${wasmDriver?.name}`
    expect(result.stderr.split(chosenMarker).length - 1).toBe(1)
  }, 60_000)
})
