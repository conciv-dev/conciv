import {execFileSync} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {afterAll, expect, test} from 'vitest'

const packageRoot = resolve(import.meta.dirname, '../..')
const consumerRoots: string[] = []

function makeConsumerRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'conciv-mascot-packed-'))
  consumerRoots.push(root)
  return root
}

const EFFECT_MOUNTS: Record<string, string> = {
  binary: 'binaryEffect',
  matrix: 'matrixEffect',
  'thought-cloud': 'thoughtCloudEffect',
  'pixel-bubbles': 'pixelBubblesEffect',
  'signal-rings': 'signalRingsEffect',
  'speech-bubble': 'speechBubbleEffect',
  steam: 'steamEffect',
  spark: 'sparkEffect',
  'spark-burst': 'sparkBurstEffect',
  'spark-fountain': 'sparkFountainEffect',
  satellite: 'satelliteEffect',
  'led-cone': 'ledConeEffect',
  'tick-ring': 'tickRingEffect',
  'signal-bars': 'signalBarsEffect',
  heart: 'heartEffect',
  notes: 'notesEffect',
}

const PROBE = `import {createFabRobotRig, createMascot, robotLayers} from '@conciv/mascot'
import {binaryEffect, configureBinaryEffect} from '@conciv/mascot/effects/binary'

const effectNames = ${JSON.stringify(Object.keys(EFFECT_MOUNTS))}
const mounted = {}
for (const name of effectNames) {
  const module = await import(\`@conciv/mascot/effects/\${name}\`)
  mounted[name] = Object.entries(module)
    .filter(([, value]) => typeof value === 'function')
    .map(([key]) => key)
    .toSorted()
}

const service = createMascot({state: 'rest', working: false, follow: false})
service.mountEffect('binary', binaryEffect)
service.unmountEffect('binary')
service.destroy()

const installedFrameworks = ['solid-js', 'react', 'react-dom'].filter((name) => {
  try {
    import.meta.resolve(name)
    return true
  } catch {
    return false
  }
})

process.stdout.write(
  JSON.stringify({
    createFabRobotRig: typeof createFabRobotRig,
    createMascot: typeof createMascot,
    binaryEffect: typeof binaryEffect,
    configureBinaryEffect: typeof configureBinaryEffect,
    layers: Object.keys(robotLayers).toSorted(),
    frameworks: installedFrameworks,
    mounted,
  }),
)
`

const SOLID_PROBE = `import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

const resolved = ['@conciv/mascot/solid', 'solid-js', 'solid-js/web'].map((name) =>
  existsSync(fileURLToPath(import.meta.resolve(name))),
)

const installedFrameworks = ['solid-js', 'react', 'react-dom'].filter((name) => {
  try {
    import.meta.resolve(name)
    return true
  } catch {
    return false
  }
})

process.stdout.write(JSON.stringify({resolved, frameworks: installedFrameworks}))
`

function expectedMounts(): Record<string, string[]> {
  const binaryMounts = ['binaryEffect', 'configureBinaryEffect']
  return Object.fromEntries(
    Object.entries(EFFECT_MOUNTS).map(([name, mount]) => [name, name === 'binary' ? binaryMounts : [mount]]),
  )
}

function packTarball(destination: string): string {
  const output = execFileSync('pnpm', ['pack', '--pack-destination', destination], {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  const tarball = output.trim().split('\n').at(-1)
  if (tarball === undefined || !existsSync(tarball)) throw new Error(`pnpm pack produced no tarball:\n${output}`)
  return tarball
}

function linkDependency(consumerRoot: string, name: string): void {
  const source = dirname(createRequire(join(packageRoot, 'package.json')).resolve(`${name}/package.json`))
  const target = join(consumerRoot, 'node_modules', name)
  mkdirSync(dirname(target), {recursive: true})
  symlinkSync(source, target, 'dir')
}

function installPackedMascot(consumerRoot: string, frameworks: string[]): void {
  const target = join(consumerRoot, 'node_modules/@conciv/mascot')
  mkdirSync(target, {recursive: true})
  execFileSync('tar', ['-xzf', packTarball(consumerRoot), '-C', target, '--strip-components=1'])
  linkDependency(consumerRoot, 'gsap')
  for (const framework of frameworks) linkDependency(consumerRoot, framework)
}

function probeInstall(frameworks: string[], probe: string): unknown {
  const consumerRoot = makeConsumerRoot()
  installPackedMascot(consumerRoot, frameworks)
  writeFileSync(join(consumerRoot, 'probe.mjs'), probe)
  return JSON.parse(execFileSync(process.execPath, ['probe.mjs'], {cwd: consumerRoot, encoding: 'utf8'}))
}

afterAll(() => {
  for (const root of consumerRoots) rmSync(root, {recursive: true, force: true})
})

test('a packed install with no framework present resolves and runs the core and effect subpaths', () => {
  expect(probeInstall([], PROBE)).toEqual({
    createFabRobotRig: 'function',
    createMascot: 'function',
    binaryEffect: 'function',
    configureBinaryEffect: 'function',
    layers: ['antenna', 'eyes', 'head'],
    frameworks: [],
    mounted: expectedMounts(),
  })
}, 60_000)

test('a packed install with only solid present resolves the solid wrapper subpath', () => {
  expect(probeInstall(['solid-js'], SOLID_PROBE)).toEqual({
    resolved: [true, true, true],
    frameworks: ['solid-js'],
  })
}, 60_000)
