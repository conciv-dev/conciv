import {execFileSync} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {afterAll, expect, test} from 'vitest'

const packageRoot = resolve(import.meta.dirname, '../..')
const consumerRoot = mkdtempSync(join(tmpdir(), 'conciv-mascot-packed-'))

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

function expectedMounts(): Record<string, string[]> {
  const binaryMounts = ['binaryEffect', 'configureBinaryEffect']
  return Object.fromEntries(
    Object.entries(EFFECT_MOUNTS).map(([name, mount]) => [name, name === 'binary' ? binaryMounts : [mount]]),
  )
}

function packTarball(): string {
  const output = execFileSync('pnpm', ['pack', '--pack-destination', consumerRoot], {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  const tarball = output.trim().split('\n').at(-1)
  if (tarball === undefined || !existsSync(tarball)) throw new Error(`pnpm pack produced no tarball:\n${output}`)
  return tarball
}

function installPackedMascot(): void {
  const target = join(consumerRoot, 'node_modules/@conciv/mascot')
  mkdirSync(target, {recursive: true})
  execFileSync('tar', ['-xzf', packTarball(), '-C', target, '--strip-components=1'])
  const gsapRoot = dirname(createRequire(join(packageRoot, 'package.json')).resolve('gsap/package.json'))
  symlinkSync(gsapRoot, join(consumerRoot, 'node_modules/gsap'), 'dir')
}

afterAll(() => {
  rmSync(consumerRoot, {recursive: true, force: true})
})

test('a packed install with no framework present resolves and runs the core and effect subpaths', () => {
  installPackedMascot()
  writeFileSync(join(consumerRoot, 'probe.mjs'), PROBE)
  const probed: unknown = JSON.parse(
    execFileSync(process.execPath, ['probe.mjs'], {cwd: consumerRoot, encoding: 'utf8'}),
  )
  expect(probed).toEqual({
    createFabRobotRig: 'function',
    createMascot: 'function',
    binaryEffect: 'function',
    configureBinaryEffect: 'function',
    layers: ['antenna', 'eyes', 'head'],
    frameworks: [],
    mounted: expectedMounts(),
  })
}, 60_000)
