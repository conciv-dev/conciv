import {readdirSync, readFileSync} from 'node:fs'
import {dirname, join, matchesGlob, relative, resolve, sep} from 'node:path'
import {expect, test} from 'vitest'
import {EFFECT_MOUNTS} from '../effect-catalog.js'

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
