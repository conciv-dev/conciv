import {copyFile, mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {harnessRegistry} from '@conciv/harness'
import {ConfigProvider} from 'effect'
import {Application, normalizePath, ReflectionKind} from 'typedoc'
import {z} from 'zod'

const ManifestSchema = z.object({
  name: z.string(),
  exports: z.record(z.string(), z.unknown()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

interface Entry {
  readonly subpath: string
  readonly file: string
}

interface Workspace {
  readonly name: string
  readonly directory: string
  readonly entries: readonly Entry[]
}

export interface PackageIndex {
  readonly name: string
  readonly file: string
  readonly subpaths: readonly string[]
}

export type Harness = ReturnType<typeof readHarnesses>[number]

function findTypes(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const entries = Object.entries(value)
  const types = entries.find(([key]) => key === 'types')?.[1]
  if (typeof types === 'string') return types
  return entries.map(([, nested]) => findTypes(nested)).find((found) => found !== undefined)
}

async function readManifest(directory: string): Promise<z.infer<typeof ManifestSchema>> {
  return ManifestSchema.parse(JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')))
}

async function readWorkspace(name: string, packageDirectory: string): Promise<Workspace> {
  const directory = await realpath(join(packageDirectory, 'node_modules', name))
  const manifest = await readManifest(directory)
  const entries = Object.entries(manifest.exports ?? {}).flatMap(([subpath, value]) => {
    const types = findTypes(value)
    return types === undefined ? [] : [{subpath, file: join(directory, types)}]
  })
  return {name, directory, entries}
}

function readFileName(name: string): string {
  return `${name.replace(/^@conciv\//, '')}.json`
}

async function convert(workspace: Workspace, others: readonly Workspace[]): Promise<unknown> {
  const application = await Application.bootstrapWithPlugins(
    {
      entryPoints: Array.from(new Set(workspace.entries.map((entry) => entry.file))),
      compilerOptions: {
        module: 'nodenext',
        moduleResolution: 'nodenext',
        target: 'esnext',
        strict: true,
        skipLibCheck: true,
      },
      excludeInternal: true,
      excludePrivate: true,
      excludeExternals: true,
      externalPattern: ['**/node_modules/**', ...others.map((other) => `${other.directory}/**`)],
      skipErrorChecking: true,
      logLevel: 'Warn',
    },
    [],
  )
  const project = await application.convert()
  if (project === undefined) throw new Error(`TypeDoc could not convert ${workspace.name}`)
  for (const module of project.getChildrenByKind(ReflectionKind.Module)) {
    const file = module.sources?.[0]?.fullFileName
    const entry = workspace.entries.find((candidate) => candidate.file === file)
    if (entry !== undefined) module.name = entry.subpath
  }
  return application.serializer.projectToObject(project, normalizePath(workspace.directory))
}

function readHarnesses() {
  return harnessRegistry(ConfigProvider.fromUnknown({}))
    .list()
    .map((adapter) => ({
      id: adapter.id,
      name: adapter.displayName ?? adapter.id,
      bin: adapter.binName,
      capabilities: adapter.capabilities,
      terminal: adapter.tty !== undefined,
      models: Array.isArray(adapter.models) ? adapter.models.map((model) => model.id) : undefined,
    }))
}

async function generate(): Promise<void> {
  const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
  const outDirectory = join(packageDirectory, 'dist')
  const manifest = await readManifest(packageDirectory)
  const names = Object.keys(manifest.devDependencies ?? {}).filter((name) => name.startsWith('@conciv/'))
  const workspaces = await Promise.all(names.map((name) => readWorkspace(name, packageDirectory)))
  const documented = workspaces.filter((workspace) => workspace.entries.length > 0)
  await rm(outDirectory, {recursive: true, force: true})
  await mkdir(outDirectory, {recursive: true})
  for (const workspace of documented) {
    const others = workspaces.filter((other) => other !== workspace)
    const json = await convert(workspace, others)
    await writeFile(join(outDirectory, readFileName(workspace.name)), JSON.stringify(json))
  }
  const index: PackageIndex[] = documented.map((workspace) => ({
    name: workspace.name,
    file: readFileName(workspace.name),
    subpaths: workspace.entries.map((entry) => entry.subpath),
  }))
  await writeFile(join(outDirectory, 'index.json'), JSON.stringify(index, null, 2))
  await writeFile(join(outDirectory, 'harnesses.json'), JSON.stringify(readHarnesses(), null, 2))
  await copyFile(fileURLToPath(import.meta.resolve('@conciv/cli/commands.json')), join(outDirectory, 'commands.json'))
}

await generate()
