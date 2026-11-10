import {createHash} from 'node:crypto'
import {dirname, extname, isAbsolute, join, relative} from 'node:path'
import {minBy, uniqBy} from 'es-toolkit'
import {ResolverFactory} from 'oxc-resolver'
import {createStorage, type Storage} from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import {z} from 'zod'
import type {Component, ModuleEdge, PropSketch, Scan} from '../../shared/catalog-defs.js'
import {viteEntries} from './entries.js'
import {parseModule} from './parse-module.js'
import {moduleScripts} from './module-scripts.js'

export async function walkProject(input: {cwd: string}): Promise<Scan> {
  const {cwd} = input
  const disk = createStorage({driver: fsDriver({base: DISK_ROOT, readOnly: true})})
  const roots = await viteEntries({cwd})
  const visited = new Map<string, Visit>()
  await roots.reduce(async (previous, root) => {
    await previous
    const resolver = new ResolverFactory(root.resolve)
    const starts = await Promise.all(root.entries.map((entry) => resolver.async(root.root, entry)))
    await crawl({
      frontier: starts.flatMap((start) =>
        start.path === undefined
          ? []
          : [
              {
                file: start.path,
                via: null,
                depth: 0,
                root: root.root,
                resolver,
                packageJson: start.packageJsonPath ?? null,
              },
            ],
      ),
      visited,
      disk,
      cwd,
    })
  }, Promise.resolve())
  const packages = new Map<string, Promise<PackageFacts>>()
  const components = await Promise.all(
    [...visited.values()].flatMap((visit) => definedIn(visit).map((definition) => ({visit, definition}))),
  ).then((found) =>
    Promise.all(found.map(({visit, definition}) => component({visit, definition, visited, packages, disk, cwd}))),
  )
  return {
    modules: [...visited.keys()].map((file) => projectPath({cwd, file})),
    edges: uniqBy(
      [...visited.values()].flatMap((visit) =>
        [...visit.resolved.values()].map((target): ModuleEdge => ({
          from: projectPath({cwd, file: visit.file}),
          to: projectPath({cwd, file: target.path}),
        })),
      ),
      (edge) => `${edge.from}>${edge.to}`,
    ),
    components,
    unreadable: roots.flatMap((root) => root.unreadable).map((file) => projectPath({cwd, file})),
  }
}

type Parsed = ReturnType<typeof parseModule>

type Item = {
  file: string
  via: string | null
  depth: number
  root: string
  resolver: ResolverFactory
  packageJson: string | null
}

type Visit = Item & {parsed: Parsed | null; resolved: Map<string, Resolved>}

type Resolved = {path: string; packageJson: string | null}

type Read = Item & {parsed: Parsed | null; requests: string[]}

type Definition = {local: string; names: string[]}

type PackageFacts = z.output<typeof PackageSchema>

const DISK_ROOT = '/'
const README = 'README.md'
const NODE_MODULES = '/node_modules/'
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'])
const DECLARATION_EXTENSIONS: Record<string, string> = {'.js': '.d.ts', '.mjs': '.d.mts', '.cjs': '.d.cts'}
const HTML_EXTENSION = '.html'
const STORY_SUFFIXES = ['.stories.tsx', '.stories.ts', '.stories.jsx', '.stories.js']
const SEE_FILE = 'see file'
const ALL_EXPORTS = '*'
const LISTED_DEPTH = 1
const README_MARKS = ['#', '-', '*', '|']
const SENTENCE_END = '. '

const PackageSchema = z.object({name: z.string().nullable().catch(null), version: z.string().nullable().catch(null)})

async function crawl(input: {
  frontier: Item[]
  visited: Map<string, Visit>
  disk: Storage
  cwd: string
}): Promise<void> {
  const {visited, disk, cwd} = input
  const fresh = uniqBy(input.frontier, (item) => item.file).filter((item) => !visited.has(item.file))
  if (fresh.length === 0) return
  const visits = await Promise.all(fresh.map(async (item) => follow(await read({item, disk}))))
  visits.forEach((visit) => visited.set(visit.file, visit))
  await crawl({
    frontier: visits.flatMap((visit) =>
      [...visit.resolved].map(([request, target]) => {
        const crossing = bare(request) && external({cwd, file: target.path})
        return {
          file: target.path,
          via: crossing ? request : visit.via,
          depth: crossing ? visit.depth + 1 : visit.depth,
          root: visit.root,
          resolver: visit.resolver,
          packageJson: target.packageJson,
        }
      }),
    ),
    visited,
    disk,
    cwd,
  })
}

async function read(input: {item: Item; disk: Storage}): Promise<Read> {
  const {item, disk} = input
  const extension = extname(item.file)
  if (extension === HTML_EXTENSION) {
    const html = await text({disk, file: item.file})
    return {...item, parsed: null, requests: html === null ? [] : moduleScripts(html)}
  }
  if (!CODE_EXTENSIONS.has(extension)) return {...item, parsed: null, requests: []}
  const dependency = item.file.includes(NODE_MODULES)
  const declarations = DECLARATION_EXTENSIONS[extension]
  const typed = dependency && declarations !== undefined ? item.file.slice(0, -extension.length) + declarations : null
  const typedSource = typed === null ? null : await text({disk, file: typed})
  const file = typed !== null && typedSource !== null ? typed : item.file
  const source = typedSource ?? (await text({disk, file: item.file}))
  if (source === null) return {...item, parsed: null, requests: []}
  const parsed = parseModule({file, source})
  return {...item, parsed, requests: dependency ? parsed.reexports : [...parsed.imports, ...parsed.reexports]}
}

async function follow(reading: Read): Promise<Visit> {
  const {requests, ...visit} = reading
  const directory = extname(visit.file) === HTML_EXTENSION ? visit.root : dirname(visit.file)
  const results = await Promise.all(
    requests.map(async (request) => ({request, result: await visit.resolver.async(directory, rooted(request))})),
  )
  return {
    ...visit,
    resolved: new Map(
      results.flatMap(({request, result}) =>
        result.path === undefined
          ? []
          : [[request, {path: result.path, packageJson: result.packageJsonPath ?? null}] satisfies [string, Resolved]],
      ),
    ),
  }
}

function rooted(request: string): string {
  return request.startsWith('/') ? `.${request}` : request
}

function external(input: {cwd: string; file: string}): boolean {
  return input.file.includes(NODE_MODULES) || isAbsolute(projectPath(input))
}

function projectPath(input: {cwd: string; file: string}): string {
  const inside = relative(input.cwd, input.file)
  return inside.startsWith('..') || isAbsolute(inside) ? input.file : inside
}

function bare(request: string): boolean {
  return !request.startsWith('.') && !request.startsWith('/')
}

function definedIn(visit: Visit): Definition[] {
  const parsed = visit.parsed
  if (parsed === null || visit.depth > LISTED_DEPTH) return []
  return [...parsed.renders].flatMap((local) => {
    const names = parsed.exports.filter((fact) => fact.local === local).map((fact) => fact.name)
    if (names.length === 0) return []
    return [{local, names: [...names.filter((name) => name === local), ...names.filter((name) => name !== local)]}]
  })
}

async function component(input: {
  visit: Visit
  definition: Definition
  visited: Map<string, Visit>
  packages: Map<string, Promise<PackageFacts>>
  disk: Storage
  cwd: string
}): Promise<Component> {
  const {visit, definition, visited, packages, disk, cwd} = input
  const parsed = visit.parsed
  const facts = visit.packageJson === null ? null : await packageFacts({file: visit.packageJson, packages, disk})
  const packageDir = visit.packageJson === null ? visit.root : dirname(visit.packageJson)
  const dependency = visit.file.includes(NODE_MODULES)
  const pkg = visit.via === null ? null : (facts?.name ?? null)
  const version = dependency ? (facts?.version ?? null) : null
  const [name = definition.local] = definition.names
  const file = projectPath({cwd, file: visit.file})
  const story = await storyOf({file: visit.file, disk})
  const storyParsed = story === null ? null : parseModule(story)
  const sentence =
    parsed?.docs.get(definition.local) ??
    (await readmeLine({dirs: [dirname(visit.file), packageDir], names: definition.names, disk})) ??
    storyParsed?.title ??
    null
  const storyUses = (storyParsed?.elements ?? []).filter((element) => definition.names.includes(element.tag))
  const sites = callSites({file: visit.file, local: definition.local, visited})
  const uses = storyUses.length > 0 ? storyUses : sites
  return {
    id: createHash('sha256')
      .update(dependency && pkg !== null ? `${pkg}@${version ?? ''}:${name}` : `${file}:${name}`)
      .digest('hex'),
    names: definition.names,
    file,
    pkg,
    version,
    specifier: visit.via ?? `./${relative(packageDir, visit.file)}`,
    renders: true,
    sentence,
    props: await propsOf({visit, local: definition.local, visited}),
    usage: minBy(outermost(uses), (use) => use.text.length)?.text ?? null,
    story: story === null ? null : projectPath({cwd, file: story.file}),
    lines: parsed?.lines.get(definition.local) ?? {start: 0, end: 0},
    sites: uniqBy(
      sites.map((site) => ({file: projectPath({cwd, file: site.file}), line: site.line})),
      (site) => `${site.file}:${site.line}`,
    ),
  }
}

async function propsOf(input: {
  visit: Visit
  local: string
  visited: Map<string, Visit>
}): Promise<PropSketch[] | typeof SEE_FILE> {
  const {visit, local, visited} = input
  const fact = visit.parsed?.props.get(local)
  if (fact === undefined || fact.kind === 'unknown') return SEE_FILE
  if (fact.kind === 'members') return fact.members
  const own = visit.parsed?.types.get(fact.name)
  if (own !== undefined) return own
  const binding = visit.parsed?.bindings.find((candidate) => candidate.local === fact.name)
  if (binding === undefined) return SEE_FILE
  const target = await visit.resolver.async(dirname(visit.file), binding.request)
  const types = target.path === undefined ? undefined : visited.get(target.path)?.parsed?.types.get(binding.imported)
  return types ?? SEE_FILE
}

function callSites(input: {file: string; local: string; visited: Map<string, Visit>}): Site[] {
  const {file, local, visited} = input
  const key = definitionKey(file, local)
  return [...visited.values()].flatMap((visit) =>
    (visit.parsed?.elements ?? [])
      .filter((element) => elementTarget({visit, tag: element.tag, visited}) === key)
      .map((element) => ({...element, file: visit.file})),
  )
}

type Use = {start: number; end: number; line: number; text: string}

type Site = Use & {file: string}

function elementTarget(input: {visit: Visit; tag: string; visited: Map<string, Visit>}): string | null {
  const {visit, tag, visited} = input
  const binding = visit.parsed?.bindings.find((candidate) => candidate.local === tag)
  if (binding === undefined) return visit.parsed?.renders.has(tag) ? definitionKey(visit.file, tag) : null
  const target = visit.resolved.get(binding.request)
  return target === undefined
    ? null
    : definitionOf({file: target.path, name: binding.imported, visited, seen: new Set()})
}

function definitionOf(input: {
  file: string
  name: string
  visited: Map<string, Visit>
  seen: Set<string>
}): string | null {
  const {file, name, visited, seen} = input
  const visit = visited.get(file)
  const step = definitionKey(file, name)
  if (visit === undefined || visit.parsed === null || seen.has(step)) return null
  seen.add(step)
  const exports = visit.parsed.exports
  const direct = exports.find((fact) => fact.name === name)
  if (direct?.local !== null && direct?.local !== undefined) return definitionKey(file, direct.local)
  const chained = direct === undefined ? exports.filter((fact) => fact.name === ALL_EXPORTS) : [direct]
  return (
    chained
      .map((fact) => {
        const target = fact.request === null ? undefined : visit.resolved.get(fact.request)
        return target === undefined
          ? null
          : definitionOf({file: target.path, name: fact.imported ?? name, visited, seen})
      })
      .find((found) => found !== null) ?? null
  )
}

function definitionKey(file: string, local: string): string {
  return `${file}#${local}`
}

function outermost(uses: Use[]): Use[] {
  return uses.filter((use) => !uses.some((other) => other !== use && other.start <= use.start && other.end >= use.end))
}

async function storyOf(input: {file: string; disk: Storage}): Promise<{file: string; source: string} | null> {
  const base = input.file.slice(0, -extname(input.file).length)
  const found = await Promise.all(
    STORY_SUFFIXES.map(async (suffix) => ({
      file: base + suffix,
      source: await text({disk: input.disk, file: base + suffix}),
    })),
  )
  const story = found.find((candidate) => candidate.source !== null)
  return story === undefined || story.source === null ? null : {file: story.file, source: story.source}
}

async function readmeLine(input: {dirs: string[]; names: string[]; disk: Storage}): Promise<string | null> {
  const readmes = await Promise.all(
    [...new Set(input.dirs)].map((dir) => text({disk: input.disk, file: join(dir, README)})),
  )
  const line = readmes
    .flatMap((readme) => (readme === null ? [] : readme.split('\n')))
    .map((candidate) => candidate.trim())
    .find((candidate) => README_MARKS.some((mark) => candidate.startsWith(mark)) && namedFirst(candidate, input.names))
  if (line === undefined) return null
  const marked = trimMarks(line)
  const end = marked.indexOf(SENTENCE_END)
  return end === -1 ? marked : marked.slice(0, end + 1)
}

function namedFirst(line: string, names: string[]): boolean {
  const [first = ''] = [...line]
    .map((char) => (wordChar(char) ? char : ' '))
    .join('')
    .split(' ')
    .filter(Boolean)
  return names.includes(first)
}

function wordChar(char: string): boolean {
  return char.toLowerCase() !== char.toUpperCase() || (char >= '0' && char <= '9') || char === '_' || char === '$'
}

function trimMarks(line: string): string {
  const chars = [...line]
  const start = chars.findIndex((char) => !README_MARKS.includes(char) && char.trim() !== '')
  const end = chars.findLastIndex((char) => !README_MARKS.includes(char) && char.trim() !== '')
  return start === -1 ? '' : chars.slice(start, end + 1).join('')
}

function packageFacts(input: {
  file: string
  packages: Map<string, Promise<PackageFacts>>
  disk: Storage
}): Promise<PackageFacts> {
  const known = input.packages.get(input.file)
  if (known !== undefined) return known
  const loaded = input.disk.getItem(input.file).then((raw) => PackageSchema.parse(raw ?? {}))
  input.packages.set(input.file, loaded)
  return loaded
}

async function text(input: {disk: Storage; file: string}): Promise<string | null> {
  const raw = await input.disk.getItemRaw<Uint8Array>(input.file).catch(() => null)
  return raw === null || raw === undefined ? null : new TextDecoder().decode(raw)
}
