import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execa} from 'execa'
import {load} from 'js-yaml'
import {z} from 'zod'
import {publishErrors} from './errors/errors.ts'
import {COMPILER_LIMIT, mapInChunks, readWorkspacePackages, type WorkspacePackage} from './workspace.ts'

const NOT_NODE_ENTRIES: readonly string[] = [
  '@conciv/backend-test-utils',
  '@conciv/plugin-design/plugin-experimental',
  '@conciv/plugin-ios/builtins',
  '@conciv/plugin-page/builtins',
  '@conciv/plugin-page/client',
  '@conciv/plugin-page/renderer',
  '@conciv/plugin-page/test-utils',
  '@conciv/plugin-recorder/plugin-experimental',
  '@conciv/plugin-tanstack/plugin-experimental',
  '@conciv/plugin-test-runner/plugin-experimental',
  '@conciv/plugin-whiteboard/plugin-experimental',
]

const ENGINE_PROOF = `import {start} from '@conciv/backend/start'
import {makeRpcClient} from '@conciv/client'

const [root, homeDir] = process.argv.slice(2)
const engine = await start({options: {}, root, homeDir, log: {emit: () => {}}})
const rpc = makeRpcClient('http://127.0.0.1:' + engine.port, {token: engine.agentToken})
const created = await rpc.sessions.create()
const page = await rpc.sessions.list({})
await engine.stop()
console.log(JSON.stringify({created: created.sessionId, sessions: page.sessions.map((session) => session.id)}))
`

const EngineProofSchema = z.object({created: z.string(), sessions: z.array(z.string())})
const CatalogSchema = z.object({catalog: z.record(z.string(), z.string()).default({})})

type Published = WorkspacePackage & {name: string; version: string}

function readFloor(packages: readonly Published[]): string {
  const floors = [...new Set(packages.flatMap((pkg) => pkg.manifest.engines?.node ?? []))]
  if (floors.length === 0) throw publishErrors.NODE_FLOOR_MISSING()
  if (floors.length > 1) throw publishErrors.NODE_FLOOR_MIXED({floors: floors.join(', ')})
  const floor = /^>=(\d+\.\d+\.\d+)$/.exec(floors[0] ?? '')?.[1]
  if (floor === undefined) throw publishErrors.NODE_FLOOR_UNREADABLE({range: floors[0] ?? ''})
  return floor
}

function versionParts(version: string): number[] {
  return version.replace(/^v/, '').split('.').map(Number)
}

function atLeast(version: string, floor: string): boolean {
  const have = versionParts(version)
  const need = versionParts(floor)
  const differing = need.findIndex((part, index) => (have[index] ?? 0) !== part)
  return differing === -1 || (have[differing] ?? 0) > (need[differing] ?? 0)
}

async function readCatalog(cwd: string): Promise<Record<string, string>> {
  return CatalogSchema.parse(load(await readFile(join(cwd, 'pnpm-workspace.yaml'), 'utf8'))).catalog
}

function exportedSpecifiers(pkg: Published): string[] {
  const exports = pkg.manifest.exports
  const subpaths = typeof exports === 'object' && exports !== null ? Object.keys(exports) : ['.']
  return subpaths
    .filter((subpath) => !subpath.includes('*') && !/\.(json|css)$/.test(subpath))
    .map((subpath) => (subpath === '.' ? pkg.name : `${pkg.name}${subpath.slice(1)}`))
    .filter((specifier) => !NOT_NODE_ENTRIES.includes(specifier))
}

function tarballName(pkg: Published): string {
  return `${pkg.name.slice(1).replace('/', '-')}-${pkg.version}.tgz`
}

async function writeConsumer(cwd: string, consumer: string, tarballs: string, published: readonly Published[]) {
  const catalog = await readCatalog(cwd)
  const overrides = Object.fromEntries(
    published.map((pkg) => [pkg.name, `file:${join(tarballs, tarballName(pkg))}`] as const),
  )
  const peers = Object.fromEntries(
    published
      .flatMap((pkg) => Object.entries(pkg.manifest.peerDependencies ?? {}))
      .filter(([name]) => !name.startsWith('@conciv/'))
      .map(([name, range]) => [name, catalog[name] ?? range] as const),
  )
  const manifest = {name: 'conciv-node-floor', private: true, type: 'module', dependencies: {...overrides, ...peers}}
  await writeFile(join(consumer, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const overrideLines = Object.entries(overrides).map(
    ([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`,
  )
  await writeFile(
    join(consumer, 'pnpm-workspace.yaml'),
    ['packages: []', 'overrides:', ...overrideLines, ''].join('\n'),
  )
  await writeFile(join(consumer, 'engine-proof.mjs'), ENGINE_PROOF)
}

async function importFailures(node: string, consumer: string, specifiers: string[]): Promise<string[]> {
  const results = await mapInChunks(specifiers, COMPILER_LIMIT, async (specifier) => {
    const result = await execa(node, ['--input-type=module', '-e', `await import(${JSON.stringify(specifier)})`], {
      cwd: consumer,
      reject: false,
    })
    return result.exitCode === 0 ? [] : [`import ${specifier}: ${result.stderr.split('\n').slice(0, 3).join(' | ')}`]
  })
  return results.flat()
}

async function engineFailures(node: string, consumer: string, scratch: string): Promise<string[]> {
  const project = join(scratch, 'project')
  const home = join(scratch, 'home')
  await mkdir(project, {recursive: true})
  await mkdir(home, {recursive: true})
  const result = await execa(node, ['engine-proof.mjs', project, home], {
    cwd: consumer,
    env: {CONCIV_SIMULATE: '1', HOME: home},
    reject: false,
  })
  if (result.exitCode !== 0) return [`engine start: ${result.stderr.split('\n').slice(0, 5).join(' | ')}`]
  const proof = EngineProofSchema.safeParse(JSON.parse(result.stdout.trim().split('\n').at(-1) ?? 'null'))
  if (!proof.success) return [`engine start: unreadable answer ${result.stdout.trim()}`]
  if (!proof.data.sessions.includes(proof.data.created))
    return [`engine start: the session list ${proof.data.sessions.join(', ')} misses ${proof.data.created}`]
  process.stdout.write(`engine: created and listed ${proof.data.created}\n`)
  return []
}

export async function checkNodeFloor(cwd: string, node: string): Promise<void> {
  const published = (await readWorkspacePackages(cwd)).flatMap((pkg): Published[] =>
    !pkg.manifest.private && pkg.manifest.name?.startsWith('@conciv/') && pkg.manifest.version
      ? [{...pkg, name: pkg.manifest.name, version: pkg.manifest.version}]
      : [],
  )
  const nodePackages = published.filter((pkg) => pkg.manifest.engines?.node !== undefined)
  const floor = readFloor(nodePackages)
  const version = (await execa(node, ['--version'])).stdout.trim()
  if (!atLeast(version, floor)) throw publishErrors.NODE_BELOW_FLOOR({version, floor})
  process.stdout.write(`node floor ${floor}, proving on ${version}\n`)
  const scratch = await mkdtemp(join(tmpdir(), 'conciv-node-floor-'))
  try {
    const tarballs = join(scratch, 'tarballs')
    const consumer = join(scratch, 'consumer')
    await mkdir(consumer, {recursive: true})
    for (const pkg of published) await execa('pnpm', ['pack', '--pack-destination', tarballs], {cwd: pkg.dir})
    const packed = await readdir(tarballs)
    const unpacked = published.filter((pkg) => !packed.includes(tarballName(pkg)))
    if (unpacked.length > 0)
      throw publishErrors.NODE_FLOOR_UNPACKED({names: unpacked.map((pkg) => pkg.name).join(', ')})
    await writeConsumer(cwd, consumer, tarballs, published)
    await execa('pnpm', ['install', '--ignore-scripts', '--prefer-offline'], {cwd: consumer})
    const specifiers = nodePackages.flatMap(exportedSpecifiers)
    const cli = await execa(node, [join(consumer, 'node_modules/@conciv/cli/dist/bin.js'), '--help'], {reject: false})
    const failures = [
      ...(cli.exitCode === 0 ? [] : [`cli --help: ${cli.stderr.split('\n').slice(0, 3).join(' | ')}`]),
      ...(await importFailures(node, consumer, specifiers)),
      ...(await engineFailures(node, consumer, scratch)),
    ]
    if (failures.length > 0) throw publishErrors.NODE_FLOOR_FAILED({version, failures})
    process.stdout.write(`cli --help ran and ${specifiers.length} node entries imported on ${version}\n`)
  } finally {
    await rm(scratch, {recursive: true, force: true})
  }
}
