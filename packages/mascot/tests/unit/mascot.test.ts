import {execFileSync} from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readdirSync,
  readFileSync,
} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join, resolve, matchesGlob, relative, sep} from 'node:path'
import {afterAll, describe, expect, test} from 'vitest'
import {EFFECT_MOUNTS} from '../effect-catalog.js'

describe('packed install', () => {
  const packageRoot = resolve(import.meta.dirname, '../..')
  const consumerRoots: string[] = []

  function makeConsumerRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'conciv-mascot-packed-'))
    consumerRoots.push(root)
    return root
  }

  const PROBE = `import {createMascot, robotLayers} from '@conciv/mascot'
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
import {Mascot} from '@conciv/mascot/solid'
import {createComponent, renderToString} from 'solid-js/web'

const sourceEntry = new URL('./node_modules/@conciv/mascot/dist/solid/index.jsx', import.meta.url)

const markup = renderToString(() => createComponent(Mascot, {}))

const rendered = ['root', 'head', 'antenna', 'eyes', 'effect'].filter((part) =>
  markup.includes('data-part="' + part + '"'),
)

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
    Mascot: typeof Mascot,
    parts: Object.keys(Mascot).toSorted(),
    rendered,
    sourceEntry: existsSync(fileURLToPath(sourceEntry)),
    frameworks: installedFrameworks,
  }),
)
`

  const REACT_PROBE = `import {Mascot} from '@conciv/mascot/react'
import {createElement} from 'react'
import {renderToString} from 'react-dom/server'

const markup = renderToString(createElement(Mascot, null))

const rendered = ['root', 'head', 'antenna', 'eyes', 'effect'].filter((part) =>
  markup.includes('data-part="' + part + '"'),
)

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
    Mascot: typeof Mascot,
    parts: Object.keys(Mascot).toSorted(),
    rendered,
    frameworks: installedFrameworks,
  }),
)
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
      createMascot: 'function',
      binaryEffect: 'function',
      configureBinaryEffect: 'function',
      layers: ['antenna', 'eyes', 'head'],
      frameworks: [],
      mounted: expectedMounts(),
    })
  }, 60_000)

  test('a packed install with only solid present imports and renders the solid wrapper subpath', () => {
    expect(probeInstall(['solid-js'], SOLID_PROBE)).toEqual({
      Mascot: 'function',
      parts: ['Antenna', 'Binary', 'Effect', 'Eyes', 'Head'],
      rendered: ['root', 'head', 'antenna', 'eyes', 'effect'],
      sourceEntry: true,
      frameworks: ['solid-js'],
    })
  }, 60_000)

  test('a packed install with only react present imports and renders the react wrapper subpath', () => {
    expect(probeInstall(['react', 'react-dom'], REACT_PROBE)).toEqual({
      Mascot: 'function',
      parts: ['Antenna', 'Binary', 'Effect', 'Eyes', 'Head'],
      rendered: ['root', 'head', 'antenna', 'eyes', 'effect'],
      frameworks: ['react', 'react-dom'],
    })
  }, 60_000)
})

describe('publish surface', () => {
  const packageRoot = resolve(import.meta.dirname, '../..')
  const distRoot = join(packageRoot, 'dist')
  const coreIndexFile = join(distRoot, 'core/index.js')
  const effectsDirectory = join(distRoot, 'core/effects') + sep
  const effectSupportFile = join(distRoot, 'core/effects/effect-support.js')
  const effectSubpaths = Object.keys(EFFECT_MOUNTS).map((name) => `./effects/${name}`)
  const IMPORT_PATTERN = /(?:from|import)\s*["'](\.[^"']*)["']/g
  const FRAMEWORK_PATTERN = /(?:from|import)\s*["'](?:solid-js|react|react-dom)(?:\/[^"']*)?["']/
  const SOLID_PATTERN = /(?:from|import)\s*["']solid-js(?:\/[^"']*)?["']/
  const REACT_PATTERN = /(?:from|import)\s*["']react(?:-dom)?(?:\/[^"']*)?["']/

  function readManifest(): unknown {
    return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
  }

  function field(source: unknown, key: string): unknown {
    if (typeof source !== 'object' || source === null) throw new Error(`expected an object to read ${key} from`)
    return Reflect.get(source, key)
  }

  function exportedImportFile(subpath: string): string {
    const entry = field(field(readManifest(), 'exports'), subpath)
    const target = field(entry, 'import')
    if (typeof target !== 'string') throw new Error(`exports["${subpath}"].import is not declared`)
    return resolve(packageRoot, target)
  }

  function exportedTypesFile(subpath: string): string {
    const entry = field(field(readManifest(), 'exports'), subpath)
    const target = field(entry, 'types')
    if (typeof target !== 'string') throw new Error(`exports["${subpath}"].types is not declared`)
    return resolve(packageRoot, target)
  }

  function sideEffectPatterns(): string[] {
    const declared = field(readManifest(), 'sideEffects')
    if (!Array.isArray(declared)) throw new Error('sideEffects is not an array')
    return declared.flatMap((pattern) => (typeof pattern === 'string' ? [pattern] : []))
  }

  function emittedModules(): string[] {
    return readdirSync(distRoot, {recursive: true, withFileTypes: true})
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => join(entry.parentPath, entry.name))
  }

  function importedModules(file: string): string[] {
    const source = readFileSync(file, 'utf8')
    return [...source.matchAll(IMPORT_PATTERN)].flatMap((match) => {
      const specifier = match[1]
      return specifier === undefined ? [] : [resolve(dirname(file), specifier)]
    })
  }

  function moduleGraph(entryFile: string): string[] {
    const seen = new Set<string>()
    const pending = [entryFile]
    while (pending.length > 0) {
      const file = pending.pop()
      if (file === undefined || seen.has(file)) continue
      seen.add(file)
      pending.push(...importedModules(file))
    }
    return [...seen]
  }

  function registersMotionPathPlugin(file: string): boolean {
    return readFileSync(file, 'utf8').includes('registerPlugin(')
  }

  function usesMotionPath(file: string): boolean {
    return readFileSync(file, 'utf8').includes('motionPath')
  }

  function builtEntries(): string[] {
    return ['.', ...effectSubpaths].map(exportedImportFile)
  }

  const isEffectModule = (file: string): boolean => file.startsWith(effectsDirectory)

  function packageRelative(file: string): string {
    return `./${relative(packageRoot, file)}`
  }

  test('the package entry is the framework-free core service and nothing else', async () => {
    expect(exportedImportFile('.')).toBe(coreIndexFile)
    const core: unknown = await import(coreIndexFile)
    expect(typeof field(core, 'createMascot')).toBe('function')
    expect(typeof field(core, 'robotSkin')).toBe('object')
    expect(typeof field(core, 'robotLayers')).toBe('object')
    expect(field(core, 'binaryEffect')).toBeUndefined()
  })

  test.each(Object.entries(EFFECT_MOUNTS))('the %s effect ships as its own subpath entry', async (name, mount) => {
    const effect: unknown = await import(exportedImportFile(`./effects/${name}`))
    expect(typeof field(effect, mount)).toBe('function')
  })

  test('the binary effect subpath also carries its curve configuration', async () => {
    const effect: unknown = await import(exportedImportFile('./effects/binary'))
    expect(typeof field(effect, 'configureBinaryEffect')).toBe('function')
  })

  test('every published entry declares its types next to its module', () => {
    for (const subpath of ['.', './solid', './react', ...effectSubpaths]) {
      expect(readFileSync(exportedTypesFile(subpath), 'utf8').length).toBeGreaterThan(0)
    }
  })

  test('every emitted module that registers a gsap plugin is named by sideEffects', () => {
    const registering = emittedModules().filter(registersMotionPathPlugin)
    expect(registering.length).toBeGreaterThan(0)
    const patterns = sideEffectPatterns()
    const unnamed = registering
      .map(packageRelative)
      .filter((file) => !patterns.some((pattern) => matchesGlob(file, pattern)))
    expect(unnamed).toEqual([])
  })

  test('every entry that animates along a motion path carries the plugin registration', () => {
    const animating = builtEntries().filter((entry) => moduleGraph(entry).some(usesMotionPath))
    expect(animating).toEqual([exportedImportFile('./effects/binary')])
    for (const entry of animating) {
      expect(moduleGraph(entry).filter(registersMotionPathPlugin)).not.toEqual([])
    }
  })

  test('the package entry pulls in no effect module at all', () => {
    expect(moduleGraph(coreIndexFile).filter(isEffectModule).map(packageRelative)).toEqual([])
  })

  test.each(effectSubpaths)('importing %s reaches no effect module but its own', (subpath) => {
    const entry = exportedImportFile(subpath)
    const reached = moduleGraph(entry).filter(
      (file) => isEffectModule(file) && file !== entry && file !== effectSupportFile,
    )
    expect(reached.map(packageRelative)).toEqual([])
  })

  test('the core and effect entries pull in no framework runtime', () => {
    const framework = builtEntries()
      .flatMap(moduleGraph)
      .filter((file) => FRAMEWORK_PATTERN.test(readFileSync(file, 'utf8')))
      .map(packageRelative)
    expect(framework).toEqual([])
  })

  test.each(['./solid', './react'])('the %s entry is a place the framework is imported', (subpath) => {
    const framework = moduleGraph(exportedImportFile(subpath))
      .filter((file) => FRAMEWORK_PATTERN.test(readFileSync(file, 'utf8')))
      .map(packageRelative)
    expect(framework).not.toEqual([])
    expect(builtEntries()).not.toContain(exportedImportFile(subpath))
  })

  test('neither wrapper entry reaches the other framework', () => {
    const solidGraph = moduleGraph(exportedImportFile('./solid'))
    const reactGraph = moduleGraph(exportedImportFile('./react'))
    expect(solidGraph.filter((file) => REACT_PATTERN.test(readFileSync(file, 'utf8')))).toEqual([])
    expect(reactGraph.filter((file) => SOLID_PATTERN.test(readFileSync(file, 'utf8')))).toEqual([])
  })
})
