import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join, relative} from 'node:path'
import {execa} from 'execa'
import {z} from 'zod'
import {findOwner, readWorkspacePackages, type WorkspacePackage} from './workspace.ts'

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/
const BUILD_CONFIG = /^(?:tsdown|vite)\.config\.[cm]?[jt]s$/
const NON_BUILD_FILE = /(?:^|\/)(?:test|__tests__)\/|\.(?:test|spec|stories|fixtures)\.[^/]+$/
const WORKSPACE_IMPORT =
  /(?:\bfrom|\bimport|\bimport\.meta\.resolve\(|\bimport\(|\brequire\()\s*['"](@conciv\/[a-z0-9-]+)(?:\/[^'"]*)?['"]/g

const PLUGIN_ROOT = 'packages/plugins/'
const KIT_BUILT_INS = ['@conciv/plugin-page', '@conciv/plugin-terminal']
const UI_KIT = /^@conciv\/ui-kit(?:-|$)/

type DependencyField = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies'
const DEPENDENCY_FIELDS: DependencyField[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

type SourceImports = {path: string; imports: string[]}

const turboSchema = z.looseObject({
  tasks: z.record(z.string(), z.looseObject({dependsOn: z.array(z.string()).optional()})).optional(),
})

export async function assertBuildDependsOnCoversImports(cwd: string): Promise<void> {
  const packages = await readWorkspacePackages(cwd)
  const buildable = new Set(packages.filter((pkg) => pkg.manifest.scripts?.build !== undefined).map(readName))
  const explicit = await Promise.all(packages.map(async (pkg) => ({pkg, dependsOn: await readBuildDependsOn(pkg)})))
  const violations = await Promise.all(
    explicit
      .filter((entry) => entry.dependsOn !== undefined && !entry.dependsOn.includes('^build'))
      .map(async ({pkg, dependsOn}) => {
        const sources = await readBuildSourceImports(cwd, packages, pkg)
        return [...new Set(sources.flatMap((source) => source.imports))]
          .filter((name) => name !== pkg.manifest.name && buildable.has(name))
          .filter((name) => !dependsOn?.includes(`${name}#build`))
          .map((name) => `${pkg.relativeDir}/turbo.json: build imports ${name} but does not depend on ${name}#build`)
      }),
  )
  const messages = violations.flat().toSorted()
  if (messages.length === 0) return
  throw new Error(
    `a turbo.json build.dependsOn without "^build" names the build of every workspace package its build sources import:\n${messages.join('\n')}`,
  )
}

function readName(pkg: WorkspacePackage): string {
  return pkg.manifest.name ?? pkg.relativeDir
}

async function readBuildDependsOn(pkg: WorkspacePackage): Promise<string[] | undefined> {
  const path = join(pkg.dir, 'turbo.json')
  if (!existsSync(path)) return undefined
  const text = await readFile(path, 'utf8')
  const result = turboSchema.safeParse(parseJson(path, text))
  if (!result.success) throw new Error(`${path}: invalid turbo.json\n${result.error.message}`)
  return result.data.tasks?.build?.dependsOn
}

function parseJson(path: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error: unknown) {
    throw new Error(`${path}: invalid JSON`, {cause: error})
  }
}

async function readBuildSourceImports(
  cwd: string,
  packages: WorkspacePackage[],
  pkg: WorkspacePackage,
): Promise<SourceImports[]> {
  const {stdout} = await execa('git', ['ls-files', '-z', '--', pkg.relativeDir], {cwd})
  const sources = stdout
    .split('\0')
    .filter((path) => path.length > 0 && findOwner(packages, path) === pkg)
    .filter((path) => isBuildSource(relative(pkg.relativeDir, path)))
  return Promise.all(
    sources.map(async (path) => {
      const text = await readFile(join(cwd, path), 'utf8')
      return {path, imports: [...text.matchAll(WORKSPACE_IMPORT)].flatMap((match) => match[1] ?? [])}
    }),
  )
}

function isBuildSource(path: string): boolean {
  if (!SOURCE_EXTENSION.test(path) || NON_BUILD_FILE.test(path)) return false
  return path.startsWith('src/') || BUILD_CONFIG.test(path)
}

export async function assertPluginsDrawThroughContextUi(cwd: string): Promise<void> {
  const packages = await readWorkspacePackages(cwd)
  const plugins = packages.filter(
    (pkg) => pkg.relativeDir.startsWith(PLUGIN_ROOT) && !KIT_BUILT_INS.includes(readName(pkg)),
  )
  const violations = await Promise.all(
    plugins.map(async (pkg) => {
      const sources = await readBuildSourceImports(cwd, packages, pkg)
      const imported = sources.flatMap(({path, imports}) =>
        [...new Set(imports)].filter((name) => UI_KIT.test(name)).map((name) => `${path}: imports ${name}`),
      )
      const declared = DEPENDENCY_FIELDS.flatMap((field) =>
        Object.keys(pkg.manifest[field] ?? {})
          .filter((name) => UI_KIT.test(name))
          .map((name) => `${pkg.relativeDir}/package.json: ${field} names ${name}`),
      )
      return [...imported, ...declared]
    }),
  )
  const messages = violations.flat().toSorted()
  if (messages.length === 0) return
  throw new Error(
    `a plugin under packages/plugins draws through ctx.ui (public plugins through the plugin SDK, internal ones through @conciv/plugin-internal defineInternalPlugin), never with @conciv/ui-kit*; only the built-ins ${KIT_BUILT_INS.join(' and ')} draw with the kit directly, like opencode's gui plugins:\n${messages.join('\n')}`,
  )
}
