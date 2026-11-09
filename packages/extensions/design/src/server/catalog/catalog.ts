import {and, desc, eq} from 'drizzle-orm'
import {chunk, countBy, minBy, takeRightWhile, uniq, uniqBy} from 'es-toolkit'
import {componentFlags, components, componentScans, type HomeDb} from '@conciv/db'
import {toolError, type ExtensionDb} from '@conciv/extension'
import {
  CatalogSchemas,
  type Catalog,
  type Component,
  type ComponentSource,
  type Scan,
} from '../../shared/catalog-defs.js'
import type {designTables} from '../tables.js'
import {projectFingerprint} from './fingerprint.js'
import {projectKey} from './project-key.js'
import {rankComponents} from './rank.js'

export function createCatalog(input: {home: HomeDb; db: DesignDb; cwd: string; sources: ComponentSource[]}): Catalog {
  const {home, db, cwd, sources} = input
  const project = projectKey({cwd})
  const walked = new Map<string, string[]>()

  async function scanIfStale(): Promise<void> {
    const key = await project
    const fingerprint = await projectFingerprint({cwd, modules: walked.get(cwd) ?? []})
    const last = home
      .select({fingerprint: componentScans.fingerprint})
      .from(componentScans)
      .where(and(eq(componentScans.project, key), eq(componentScans.tree, cwd)))
      .orderBy(desc(componentScans.seq))
      .get()
    if (last?.fingerprint === fingerprint) return
    const scan = union(await Promise.all(sources.map((source) => source.scan({cwd}))))
    walked.set(cwd, scan.modules)
    store({key, scan, fingerprint: await projectFingerprint({cwd, modules: scan.modules})})
  }

  function store(stored: {key: string; scan: Scan; fingerprint: string}): void {
    const {key, scan, fingerprint} = stored
    const at = Date.now()
    const imports = countBy(scan.edges, (edge) => edge.to)
    home.transaction((tx) => {
      tx.delete(components)
        .where(and(eq(components.project, key), eq(components.tree, cwd)))
        .run()
      chunk(scan.components, INSERT_CHUNK).forEach((part) =>
        tx
          .insert(components)
          .values(
            part.map((component) => ({
              ...component,
              project: key,
              tree: cwd,
              imports: imports[component.file] ?? 0,
              scannedAt: at,
            })),
          )
          .run(),
      )
      tx.insert(componentScans)
        .values({
          project: key,
          tree: cwd,
          fingerprint,
          modules: scan.modules.length,
          components: scan.components.length,
          at,
        })
        .run()
    })
  }

  async function rows() {
    const key = await project
    return home
      .select()
      .from(components)
      .where(and(eq(components.project, key), eq(components.tree, cwd)))
      .all()
  }

  async function named(name: string): Promise<Component> {
    await scanIfStale()
    const found = (await rows()).map((row) => CatalogSchemas.Component.parse(row))
    const component =
      found.find((candidate) => candidate.names[0] === name) ??
      found.find((candidate) => candidate.names.includes(name))
    if (component === undefined) throw toolError('no-component', {message: `no component named ${name} in the catalog`})
    return component
  }

  return {
    scanIfStale,
    async list(query) {
      await scanIfStale()
      const key = await project
      const flags = home.select().from(componentFlags).where(eq(componentFlags.project, key)).all()
      return rankComponents({
        components: (await rows()).map((row) => ({...CatalogSchemas.Component.parse(row), imports: row.imports})),
        flags: new Map(flags.map((flag) => [flag.componentId, flag.flag])),
        live: (query.live ?? []).map((source) => located(source).file),
      })
    },
    async show(name) {
      const component = await named(name)
      const {node_components: nodeComponents} = db.tables
      const nodes = await db.orm
        .select({
          target: nodeComponents.target_id,
          round: nodeComponents.round,
          node: nodeComponents.node,
          source: nodeComponents.source,
        })
        .from(nodeComponents)
        .where(eq(nodeComponents.component_id, component.id))
      return {...component, nodes}
    },
    async flag(name, flag) {
      const component = await named(name)
      const key = await project
      if (flag === CLEAR) {
        home
          .delete(componentFlags)
          .where(and(eq(componentFlags.project, key), eq(componentFlags.componentId, component.id)))
          .run()
        return
      }
      const row = {project: key, componentId: component.id, flag, at: Date.now()}
      home
        .insert(componentFlags)
        .values(row)
        .onConflictDoUpdate({target: [componentFlags.project, componentFlags.componentId], set: row})
        .run()
    },
    async componentOf(source) {
      const {file, line} = located(source)
      const holding = (await rows())
        .map((row) => CatalogSchemas.Component.parse(row))
        .filter((component) => component.file === file && component.lines.start <= line && line <= component.lines.end)
      return minBy(holding, (component) => component.lines.end - component.lines.start) ?? null
    },
  }
}

type DesignDb = ExtensionDb<ReturnType<typeof designTables>>

const INSERT_CHUNK = 500
const CLEAR = 'clear'
const SOURCE_SEPARATOR = ':'

function union(scans: Scan[]): Scan {
  return {
    modules: uniq(scans.flatMap((scan) => scan.modules)),
    edges: uniqBy(
      scans.flatMap((scan) => scan.edges),
      (edge) => `${edge.from}>${edge.to}`,
    ),
    components: uniqBy(
      scans.flatMap((scan) => scan.components),
      (component) => component.id,
    ),
    unreadable: uniq(scans.flatMap((scan) => scan.unreadable)),
  }
}

function located(source: string): {file: string; line: number} {
  const parts = source.split(SOURCE_SEPARATOR)
  const position = takeRightWhile(parts, (part) => part !== '' && Number.isInteger(Number(part)))
  return {
    file: parts.slice(0, parts.length - position.length).join(SOURCE_SEPARATOR),
    line: Number(position[0] ?? Number.NaN),
  }
}
