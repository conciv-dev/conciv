import {copyFile, mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {harnessRegistry} from '@conciv/harness'
import {ConfigProvider} from 'effect'
import {
  Application,
  type Context,
  Converter,
  type DeclarationReflection,
  normalizePath,
  type ProjectReflection,
  ReflectionFlag,
  ReflectionKind,
} from 'typedoc'
import ts from 'typescript'
import {z} from 'zod'

const ManifestSchema = z.object({
  name: z.string(),
  exports: z.record(z.string(), z.unknown()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
})

const ConditionsSchema = z.record(z.string(), z.unknown())

const symbolKinds: ReadonlyArray<readonly [ts.SymbolFlags, ReflectionKind]> = [
  [ts.SymbolFlags.Class, ReflectionKind.Class],
  [ts.SymbolFlags.Interface, ReflectionKind.Interface],
  [ts.SymbolFlags.Enum, ReflectionKind.Enum],
  [ts.SymbolFlags.Function, ReflectionKind.Function],
  [ts.SymbolFlags.Module, ReflectionKind.Namespace],
  [ts.SymbolFlags.TypeAlias, ReflectionKind.TypeAlias],
]

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
  const conditions = ConditionsSchema.safeParse(value).data ?? {}
  const types = conditions['types']
  return typeof types === 'string' ? types : Object.values(conditions).map(findTypes).find(Boolean)
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

function isFrom(module: DeclarationReflection, file: string): boolean {
  return module.sources?.[0]?.fullFileName === file
}

function nameModules(project: ProjectReflection, entries: readonly Entry[]): void {
  const modules = project.getChildrenByKind(ReflectionKind.Module)
  for (const entry of entries.toReversed()) {
    for (const module of modules.filter((candidate) => isFrom(candidate, entry.file))) module.name = entry.subpath
  }
}

function readEntryFiles(workspace: Workspace): string[] {
  return Array.from(new Set(workspace.entries.map((entry) => entry.file)))
}

function readKind(symbol: ts.Symbol): ReflectionKind {
  return symbolKinds.find(([flag]) => (symbol.flags & flag) !== 0)?.[1] ?? ReflectionKind.Variable
}

function resolveAlias(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol)
}

function isOutside(symbol: ts.Symbol, directory: string): boolean {
  const files = (symbol.declarations ?? []).map((declaration) => declaration.getSourceFile().fileName)
  return files.length > 0 && files.every((file) => !file.startsWith(`${directory}/`))
}

function readExports(context: Context, file: string): ts.Symbol[] {
  const source = context.program.getSourceFile(file)
  const module = source === undefined ? undefined : context.checker.getSymbolAtLocation(source)
  return module === undefined ? [] : context.checker.getExportsOfModule(module)
}

function addReexport(context: Context, exported: ts.Symbol, directory: string): void {
  const target = resolveAlias(exported, context.checker)
  if (!isOutside(target, directory)) return
  const alias = isOutside(exported, directory) ? undefined : exported
  const reflection = context.createDeclarationReflection(readKind(target), undefined, alias, exported.name)
  reflection.setFlag(ReflectionFlag.External)
  reflection.type = context.createSymbolReference(target, context, exported.name)
  context.finalizeDeclarationReflection(reflection)
}

type Scope = readonly [ProjectReflection | DeclarationReflection, string]

function readScopes(context: Context, workspace: Workspace): Scope[] {
  const modules = context.project.getChildrenByKind(ReflectionKind.Module)
  const [single] = readEntryFiles(workspace)
  if (modules.length === 0) return single === undefined ? [] : [[context.project, single]]
  return modules.flatMap((module): Scope[] => {
    const file = module.sources?.[0]?.fullFileName
    return file === undefined ? [] : [[module, file]]
  })
}

function addScopeReexports(context: Context, scope: Scope[0], file: string, directory: string): void {
  const documented = new Set((scope.children ?? []).map((child) => child.name))
  const missing = readExports(context, file).filter((exported) => !documented.has(exported.name))
  for (const exported of missing) addReexport(context.withScope(scope), exported, directory)
}

function addReexports(context: Context, workspace: Workspace): void {
  for (const [scope, file] of readScopes(context, workspace)) {
    const program = context.programs.find((candidate) => candidate.getSourceFile(file) !== undefined)
    if (program === undefined) continue
    context.setActiveProgram(program)
    addScopeReexports(context, scope, file, workspace.directory)
  }
  context.setActiveProgram(undefined)
}

async function convert(workspace: Workspace, others: readonly Workspace[]): Promise<unknown> {
  const application = await Application.bootstrapWithPlugins(
    {
      entryPoints: readEntryFiles(workspace),
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
  application.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context) => addReexports(context, workspace), 1)
  const project = await application.convert()
  if (project === undefined) throw new Error(`TypeDoc could not convert ${workspace.name}`)
  nameModules(project, workspace.entries)
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
