import {and, asc, desc, eq, inArray, isNull, lt, max, sql, type SQL} from 'drizzle-orm'
import {keyBy, omit, uniqBy} from 'es-toolkit'
import type {SQLiteColumn} from 'drizzle-orm/sqlite-core'
import {toolError} from '@conciv/extension'
import {
  CssomSnapshotSchema,
  DomSnapshotSchema,
  RoundSchema,
  type CssomSite,
  type DomSite,
  type GateRow,
  type IdNode,
  type IdTree,
  type Mapping,
  type Round,
  type TargetRecord,
} from '../shared/defs.js'
import type {Store} from '../shared/store.js'
import type {Catalog} from '../shared/catalog-defs.js'
import {walk} from '../shared/tree.js'
import {attached} from './attached.js'
import {nodeLooks} from './node-look.js'
import {writeFom} from './write-fom.js'
import {relateRound} from './catalog/relate.js'
import {roundOf} from './round-of.js'
import type {openStore} from './runs/open-store.js'
import type {storeTables} from './runs/store-tables.js'
import type {Artifacts} from './runs/artifacts.js'
import {snapshotFiles} from './runs/snapshot-files.js'

export function createStore(input: {
  db: DesignDb
  artifacts: Artifacts
  runs: {
    of: (sessionId: string) => Promise<number | null>
    latest: () => Promise<{sessionId: string; run: number} | null>
  }
  project: Promise<string>
  catalog: Catalog
}): Store {
  const {artifacts, runs, catalog} = input
  const {orm, tables} = input.db
  const {
    artifacts: catalogued,
    hints,
    runs: runRows,
    targets,
    rounds,
    rows,
    fom,
    votes,
    nodes,
    notes,
    tool_calls: toolCalls,
    missing,
    candidates,
    widths,
    regions,
    node_components: nodeComponents,
    labels,
  } = tables

  const pending = new Map<string, ((tx: Transaction) => void)[]>()

  function later(deferred: {key: string; write: (tx: Transaction) => void}): void {
    pending.set(deferred.key, [...(pending.get(deferred.key) ?? []), deferred.write])
  }

  async function ofProject(): Promise<SQL | undefined> {
    const key = await input.project
    return inArray(targets.run_id, orm.select({run: runRows.run_id}).from(runRows).where(eq(runRows.project_key, key)))
  }

  async function target(id: string): Promise<TargetRow | undefined> {
    const [found] = await orm
      .select()
      .from(targets)
      .where(and(eq(targets.target_id, id), await ofProject()))
      .orderBy(desc(targets.run_id))
      .limit(1)
    return found
  }

  async function held(): Promise<TargetRow[]> {
    const latest = await orm
      .select()
      .from(targets)
      .where(await ofProject())
      .orderBy(desc(targets.run_id))
    return uniqBy(latest, (row) => row.target_id).toSorted((a, b) => a.at - b.at)
  }

  async function list(): Promise<TargetRecord[]> {
    return (await held()).map(recordOf)
  }

  async function runOf(id: string): Promise<{run: number; row: TargetRow}> {
    const found = await target(id)
    if (found === undefined) throw toolError('no-target', {message: `no design ${id} is registered; call design_get`})
    const own = await runs.of(found.session)
    const latest = own === null ? await runs.latest() : {sessionId: found.session, run: own}
    if (latest === null) throw toolError('no-target', {message: `no run holds ${id}; call design_get again`})
    const {run} = latest
    if (run === found.run_id) return {run, row: found}
    const looks = await orm
      .select()
      .from(nodes)
      .where(and(eq(nodes.run_id, found.run_id), eq(nodes.target_id, id)))
    const moved = {...found, run_id: run, session: latest.sessionId}
    orm.transaction((tx) => {
      tx.insert(targets).values(moved).run()
      for (const {seq: _seq, ...look} of looks)
        tx.insert(nodes)
          .values({...look, run_id: run, session: latest.sessionId})
          .run()
    })
    return {run, row: moved}
  }

  function keyed(table: Keyed, row: {run_id: number; target_id: string}): SQL | undefined {
    return and(eq(table.run_id, row.run_id), eq(table.target_id, row.target_id))
  }

  async function roundsOf(where: {id: string; round?: number}): Promise<Round[]> {
    const found = await target(where.id)
    if (found === undefined) return []
    const [heads, listedRows, listedMissing, listedCandidates, listedWidths, listedRegions] = await Promise.all([
      orm
        .select()
        .from(rounds)
        .where(and(keyed(rounds, found), inArray(rounds.state, JUDGED)))
        .orderBy(asc(rounds.seq)),
      orm
        .select()
        .from(rows)
        .where(and(keyed(rows, found), sql`${rows.magnitude} <> ${SLIGHTLY}`))
        .orderBy(asc(rows.seq)),
      orm.select().from(missing).where(keyed(missing, found)).orderBy(asc(missing.seq)),
      orm.select().from(candidates).where(keyed(candidates, found)).orderBy(asc(candidates.seq)),
      orm.select().from(widths).where(keyed(widths, found)).orderBy(asc(widths.seq)),
      orm.select().from(regions).where(keyed(regions, found)).orderBy(asc(regions.seq)),
    ])
    const names = namesIn(found)
    const byRound = <T extends {round: number}>(listed: T[]) => Map.groupBy(listed, (entry) => entry.round)
    const rowsBy = byRound(listedRows)
    const missingBy = byRound(listedMissing)
    const candidatesBy = byRound(listedCandidates)
    const widthsBy = byRound(listedWidths)
    const regionsBy = byRound(listedRegions)
    const built = heads.map((head, index) =>
      roundOf({
        head,
        before: heads[index - 1] ?? null,
        rows: rowsBy.get(head.round) ?? [],
        missing: missingBy.get(head.round) ?? [],
        missingBefore: missingBy.get(heads[index - 1]?.round ?? -1) ?? [],
        candidates: candidatesBy.get(head.round) ?? [],
        widths: widthsBy.get(head.round) ?? [],
        regions: regionsBy.get(head.round) ?? [],
        names,
      }),
    )
    return where.round === undefined ? built : built.filter((round) => round.round === where.round)
  }

  async function namesOf(id: string): Promise<Map<string, string>> {
    const found = await target(id)
    return found === undefined ? new Map() : namesIn(found)
  }

  async function fomAt(where: {id: string; round?: number}): Promise<FomRow[]> {
    const found = await target(where.id)
    if (found === undefined) return []
    const [last] = await orm
      .select({round: max(fom.round)})
      .from(fom)
      .where(keyed(fom, found))
    const round = where.round ?? last?.round ?? null
    if (round === null) return []
    return orm
      .select()
      .from(fom)
      .where(and(keyed(fom, found), eq(fom.round, round)))
      .orderBy(asc(fom.seq))
  }

  async function mappingOf(where: {id: string; round?: number}): Promise<Mapping> {
    const stored = await fomAt(where)
    return Object.fromEntries(
      Object.entries(Object.groupBy(stored, (row) => row.id)).map(([key, grouped]) => [
        key,
        {
          nodes: (grouped ?? []).map((row) => ({
            nodeId: row.node,
            instance: row.instance,
            confidence: row.confidence,
            margin: row.margin,
            round: row.voted_round ?? row.round,
          })),
        },
      ]),
    )
  }

  async function artifactAt(where: {found: TargetRow; round: number; kind: 'screenshot' | 'diff' | 'dom' | 'cssom'}) {
    const {found, round, kind} = where
    const [stored] = await orm
      .select({path: catalogued.path})
      .from(catalogued)
      .where(
        and(
          eq(catalogued.run_id, found.run_id),
          eq(catalogued.target_id, found.target_id),
          eq(catalogued.round, round),
          eq(catalogued.kind, kind),
        ),
      )
      .orderBy(sql`abs(${catalogued.width} - ${found.width})`)
      .limit(1)
    return stored?.path ?? null
  }

  async function snapshotJson(where: {found: TargetRow; round: number; kind: 'dom' | 'cssom'}): Promise<unknown> {
    const path = await artifactAt(where)
    const bytes = path === null ? null : await artifacts.read(path)
    return bytes === null ? null : JSON.parse(new TextDecoder().decode(bytes))
  }

  async function snapshotTree(where: {found: TargetRow; round: number}): Promise<IdTree | null> {
    const [dom, cssom] = await Promise.all([
      snapshotJson({...where, kind: 'dom'}),
      snapshotJson({...where, kind: 'cssom'}),
    ])
    const sites = DomSnapshotSchema.safeParse(dom)
    if (!sites.success) return null
    const styles = CssomSnapshotSchema.safeParse(cssom)
    const {revoted, gone, root} = sites.data
    return {revoted, gone, root: zipped({dom: root, cssom: styles.success ? styles.data.root : undefined})}
  }

  async function repeatsBefore(where: {found: TargetRow; round: number}): Promise<Map<string, number>> {
    const {found} = where
    const [previous] = await orm
      .select({round: max(rounds.round)})
      .from(rounds)
      .where(and(keyed(rounds, found), inArray(rounds.state, JUDGED), lt(rounds.round, where.round)))
    const before = previous?.round ?? null
    if (before === null) return new Map()
    const earlier = await orm
      .select()
      .from(rows)
      .where(and(keyed(rows, found), eq(rows.round, before)))
    return new Map(earlier.map((row) => [rowKey(row), row.repeat + 1]))
  }

  function writeShots(written: {tx: Transaction; own: Own; shots: Shot[]}): void {
    const {tx, own} = written
    for (const shot of written.shots)
      for (const file of snapshotFiles(shot))
        artifacts.write(tx, {
          run: own.run_id,
          session: own.session,
          target: own.target_id,
          round: own.round,
          width: file.width,
          kind: file.kind,
          bytes: file.bytes,
        })
  }

  return {
    put: async ({design, image, raw, session, route, widget = 'hidden', notes: told = []}) => {
      const run = await runs.of(session)
      if (run === null) throw toolError('no-target', {message: 'no run is open for this session; call design_get'})
      const own = {run, session, target: design.id}
      const row = {
        target_id: design.id,
        run_id: run,
        session,
        link: design.source.ref,
        route: route ?? null,
        width: design.viewport.width,
        height: design.viewport.height,
        scale: design.scale,
        design,
        image: '',
        widget,
        unsettled: 0,
        lead: null,
        at: Date.now(),
      }
      const framed = orm.transaction((tx) => {
        const placed = {...row, image: artifacts.write(tx, {...own, kind: 'frame', bytes: image})}
        artifacts.write(tx, {...own, kind: 'design', bytes: jsonBytes(design)})
        if (raw !== undefined) artifacts.write(tx, {...own, kind: 'figma', bytes: jsonBytes(raw)})
        tx.insert(targets)
          .values(placed)
          .onConflictDoUpdate({target: [targets.run_id, targets.target_id], set: omit(placed, ['lead'])})
          .run()
        tx.delete(nodes).where(keyed(nodes, placed)).run()
        for (const {gradient: _gradient, lineAuto: _auto, ...look} of nodeLooks(design))
          tx.insert(nodes)
            .values({...look, target_id: design.id, run_id: run, session})
            .run()
        for (const text of told) tx.insert(notes).values({target_id: design.id, run_id: run, session, text}).run()
        return placed
      })
      return recordOf(framed)
    },
    design: async (id) => {
      const found = await target(id)
      if (found !== undefined) return found.design
      throw toolError('no-target', {message: `the stored design ${id} is unreadable; call design_get again`})
    },
    image: async ({id, round, kind}) => {
      const found = await target(id)
      if (found === undefined) return null
      if (round === undefined) return artifacts.read(found.image)
      const path = await artifactAt({found, round, kind: kind === 'diff' ? 'diff' : 'screenshot'})
      return path === null ? null : artifacts.read(path)
    },
    mapping: (id) => mappingOf({id}),
    sources: async (id) =>
      uniqBy(await fomAt({id}), (row) => row.id).flatMap((row) => {
        const source = row.source ?? row.site
        return source === null ? [] : [source]
      }),
    writeRelation: async ({id, round, tree}) => {
      const {run: runId, row} = await runOf(id)
      const {relation, write} = await relateRound({
        db: input.db,
        catalog,
        targetId: id,
        runId,
        session: row.session,
        round,
        sites: [...walk(tree.root)].flatMap(({node: site}) => {
          const {at: loc} = site.src
          const source = loc === null ? site.src.site : `${loc.file}:${loc.line}:${loc.column}`
          if (source === undefined) return []
          return site.fom.map((entry) => ({node: entry.nodeId, source}))
        }),
      })
      later({key: roundKey({run: runId, id, round}), write})
      return relation
    },
    writeVotes: async ({id, round, votes: cast}) => {
      const {run: runId, row} = await runOf(id)
      const names = await namesOf(id)
      const at = Date.now()
      const own = {target_id: id, run_id: runId, session: row.session, round, at}
      later({
        key: roundKey({run: runId, id, round}),
        write: (tx) => {
          for (const ballot of cast)
            tx.insert(votes)
              .values({...ballot, name: names.get(ballot.node) ?? null, ...own})
              .run()
        },
      })
    },
    writeLabel: async ({target: targetId, round, node, id, verdict, by}) => {
      const {run, row} = await runOf(targetId)
      await orm
        .insert(labels)
        .values({target_id: targetId, run_id: run, session: row.session, round, node, id, verdict, by})
    },
    writeHints: async ({id, round, hints: told}) => {
      if (told.length === 0) return
      const {run, row} = await runOf(id)
      await orm
        .insert(hints)
        .values(told.map((hint) => ({...hint, target_id: id, run_id: run, session: row.session, round})))
    },
    writeToolCall: async ({session, tool, round, input: given, reply, replyBytes, durationMs, error}) => {
      const run = await runs.of(session)
      if (run === null) return
      const [latest] = await orm
        .select({id: targets.target_id})
        .from(targets)
        .where(and(eq(targets.run_id, run), eq(targets.session, session)))
        .orderBy(desc(targets.at))
        .limit(1)
      await orm.insert(toolCalls).values({
        target_id: latest?.id ?? null,
        run_id: run,
        session,
        tool,
        round,
        input: given,
        reply,
        reply_bytes: replyBytes,
        duration_ms: durationMs,
        error,
        at: Date.now(),
      })
    },
    runRound: async (session) => {
      const run = await runs.of(session)
      if (run === null) return null
      const [last] = await orm
        .select({round: max(rounds.round)})
        .from(rounds)
        .where(eq(rounds.run_id, run))
      return last?.round ?? null
    },
    ids: async ({id, round}) => {
      const found = await target(id)
      if (found === undefined) return null
      const settled = and(eq(rounds.state, MEASURED), isNull(rounds.unsettled))
      const [stored] = await orm
        .select({round: rounds.round})
        .from(rounds)
        .where(and(keyed(rounds, found), round === undefined ? settled : eq(rounds.round, round)))
        .orderBy(desc(rounds.seq))
        .limit(1)
      if (stored === undefined) return null
      const tree = await snapshotTree({found, round: stored.round})
      if (tree === null) return null
      return {...tree, root: attached({node: tree.root, mapping: await mappingOf({id, round: stored.round})})}
    },
    looks: async (id) => {
      const found = await target(id)
      if (found === undefined) return []
      return (await orm.select().from(nodes).where(keyed(nodes, found)).orderBy(asc(nodes.seq))).map(
        ({seq: _seq, target_id: _target, run_id: _run, ...look}) => look,
      )
    },
    relation: async ({id, round}) => {
      const found = await target(id)
      if (found === undefined) return new Map()
      const related = await orm
        .select({node: nodeComponents.node, component: nodeComponents.component_id})
        .from(nodeComponents)
        .where(and(keyed(nodeComponents, found), eq(nodeComponents.round, round)))
      const components = keyBy(await catalog.list({hidden: true}), (component) => component.id)
      return new Map(
        related.flatMap(({node, component}) => {
          const named = components[component]
          return named === undefined ? [] : [[node, named]]
        }),
      )
    },
    unsettledCount: async (id) => (await target(id))?.unsettled ?? 0,
    writeUnsettledCount: async ({id, count}) => {
      const {row} = await runOf(id)
      await orm.update(targets).set({unsettled: count}).where(keyed(targets, row))
    },
    nextRound: async (id) => {
      const found = await target(id)
      if (found === undefined) return 1
      const [last] = await orm
        .select({round: max(rounds.round)})
        .from(rounds)
        .where(keyed(rounds, found))
      return (last?.round ?? 0) + 1
    },
    writeRound: async ({id, round, slight = [], notes: told = [], ids, shots = [], imageMismatch}) => {
      const written = RoundSchema.parse(round)
      const names = await namesOf(id)
      const before = await fomAt({id})
      const {run: runId, row: found} = await runOf(id)
      const own = {target_id: id, run_id: runId, session: found.session, round: written.round}
      const repeats = await repeatsBefore({found, round: written.round})
      orm.transaction((tx) => {
        for (const text of told)
          tx.insert(notes)
            .values({...own, text})
            .run()
        tx.insert(rounds)
          .values({...roundValues({own, written}), image_mismatch: imageMismatch ?? null})
          .run()
        if (ids !== undefined) writeFom({tx, fom, own, ids, names, before, at: written.at})
        writeShots({tx, own, shots})
        const key = roundKey({run: runId, id, round: written.round})
        for (const write of pending.get(key) ?? []) write(tx)
        pending.delete(key)
        const into = {tx, tables, own}
        insertRows({...into, written, rows: [...written.rows, ...slight], repeats})
        insertCoverage({...into, coverage: written.coverage})
        insertWidths({...into, reflow: written.reflow})
        insertRegions({...into, changed: written.progress?.changed})
      })
      return written
    },
    writeCheck: async ({id, round, state, sameAs, unsettled, rendered, tree, shots = []}) => {
      const {run: runId, row: found} = await runOf(id)
      const own = {target_id: id, run_id: runId, session: found.session, round}
      orm.transaction((tx) => {
        tx.insert(rounds)
          .values({
            ...own,
            state,
            same_as: sameAs ?? null,
            unsettled: unsettled ?? null,
            rendered: rendered ?? 0,
            tree: tree ?? '',
            at: Date.now(),
          })
          .run()
        writeShots({tx, own, shots})
      })
    },
    round: async ({id, round}) => (await roundsOf({id, round})).at(-1) ?? null,
    rounds: (id) => roundsOf({id}),
    current: async (session) => {
      const records = await list()
      return records.filter((entry) => entry.session === session).at(-1) ?? records.at(-1) ?? null
    },
    variants: async (session) => {
      const all = await held()
      const last = all.filter((entry) => entry.session === session).at(-1) ?? all.at(-1)
      if (last === undefined) return []
      if (last.lead === null) return [recordOf(last)]
      return all
        .filter((entry) => entry.lead === last.lead)
        .map(recordOf)
        .toSorted((a, b) => b.width - a.width)
    },
    reroute: async ({session, route}) => {
      const run = await runs.of(session)
      if (run === null) return
      await orm.update(targets).set({route}).where(eq(targets.run_id, run))
    },
    group: async (ids) => {
      const [lead] = ids
      if (lead === undefined) return
      const {run} = await runOf(lead)
      await orm
        .update(targets)
        .set({lead})
        .where(and(eq(targets.run_id, run), inArray(targets.target_id, ids)))
    },
    list,
  }
}

type DesignDb = {orm: ReturnType<typeof openStore>['orm']; tables: typeof storeTables}

type Keyed = {run_id: SQLiteColumn; target_id: SQLiteColumn}

type TargetRow = DesignDb['tables']['targets']['$inferSelect']

type Tables = DesignDb['tables']

type RowRow = Tables['rows']['$inferSelect']

type FomRow = DesignDb['tables']['fom']['$inferSelect']

type Transaction = Parameters<Parameters<DesignDb['orm']['transaction']>[0]>[0]

type Own = {target_id: string; run_id: number; session: string; round: number}

type Shot = NonNullable<Parameters<Store['writeRound']>[0]['shots']>[number]

const MEASURED = 'measured'

const JUDGED: ('measured' | 'broken')[] = [MEASURED, 'broken']

const SLIGHTLY = 'slightly'

type Into = {tx: Transaction; tables: Tables; own: Own}

function roundValues(input: {own: Own; written: Round}): Tables['rounds']['$inferInsert'] {
  const {own, written} = input
  const {counts, coverage} = written
  return {
    ...own,
    state: written.broken === null ? MEASURED : 'broken',
    at: written.at,
    much: counts.much,
    noticeably: counts.noticeably,
    slightly: counts.slightly,
    pins: counts.pins,
    other: counts.other,
    reflow: counts.reflow,
    paint: counts.paint ?? 0,
    drift: counts.drift ?? 0,
    rows_count: counts.rows,
    nodes: coverage.nodes,
    mapped: coverage.mapped,
    rendered: coverage.rendered,
    revoted: coverage.revoted,
    pixel_share: written.pixels?.share ?? null,
    ...progressValues(written.progress),
    tree: written.tree,
    verdict: written.verdict,
    unsettled: written.unsettled,
    broken: written.broken,
    broken_by: written.brokenBy,
  }
}

function progressValues(progress: Round['progress']) {
  if (progress === undefined || progress === null) return EMPTY_PROGRESS
  return {
    pixel_before: progress.pixels.before,
    closed: progress.closed,
    opened: progress.opened,
    kept: progress.kept.length,
    gained: progress.mapped.gained.length,
    lost: progress.mapped.lost.length,
    changed_ratio: progress.changed?.ratio ?? null,
    changed_regions: progress.changed?.count ?? null,
    note: progress.note ?? null,
  }
}

const EMPTY_PROGRESS = {
  pixel_before: null,
  closed: null,
  opened: null,
  kept: null,
  gained: null,
  lost: null,
  changed_ratio: null,
  changed_regions: null,
  note: null,
}

function insertRows(input: Into & {written: Round; rows: GateRow[]; repeats: Map<string, number>}): void {
  const {tx, tables, own, written, repeats} = input
  for (const row of input.rows)
    tx.insert(tables.rows)
      .values({
        ...own,
        at: written.at,
        ...rowOf(row),
        repeat: repeats.get(rowKey({...row, width: row.width ?? null})) ?? 0,
      })
      .run()
}

function insertCoverage(input: Into & {coverage: Round['coverage']}): void {
  const {tx, tables, own, coverage} = input
  const listed = [
    ...coverage.missing.map((node) => ({node, kind: 'missing' as const})),
    ...coverage.notRendered.map((node) => ({node, kind: 'not_rendered' as const})),
    ...coverage.dupes.map((node) => ({node, kind: 'dupe' as const})),
    ...(coverage.gone ?? []).map(({id, name}) => ({node: id, name, kind: 'gone' as const})),
  ]
  for (const entry of listed)
    tx.insert(tables.missing)
      .values({...own, ...entry})
      .run()
  for (const tied of coverage.candidates)
    for (const {selector, score} of tied.candidates)
      tx.insert(tables.candidates)
        .values({...own, node: tied.node, selector, score})
        .run()
}

function insertWidths(input: Into & {reflow: Round['reflow']}): void {
  const {tx, tables, own, reflow} = input
  for (const {width, from} of reflow.widths) {
    const result = reflow.results.find((entry) => entry.width === width)
    const measured = {root_height: result?.rootHeight ?? 0, overflow_x: result?.overflowX ?? false}
    for (const named of from)
      tx.insert(tables.widths)
        .values({...own, width, from: named, ...measured})
        .run()
  }
}

function insertRegions(input: Into & {changed: NonNullable<Round['progress']>['changed'] | undefined}): void {
  const {tx, tables, own, changed} = input
  for (const region of changed?.regions ?? []) {
    const {x, y, w, h} = region.box
    const at = {...own, x, y, width: w, height: h, truncated: changed?.truncated ?? false}
    const named = region.ids.length === 0 ? [null] : region.ids
    for (const entry of named)
      tx.insert(tables.regions)
        .values({
          ...at,
          id: entry?.id ?? null,
          node: entry?.node ?? null,
          name: entry?.name ?? null,
          source: entry?.source ?? null,
          overlap: entry?.overlap ?? null,
        })
        .run()
  }
}

function roundKey(input: {run: number; id: string; round: number}): string {
  return JSON.stringify([input.run, input.id, input.round])
}

function namesIn(found: TargetRow): Map<string, string> {
  return new Map([...walk(found.design.root)].map(({node}) => [node.id, node.figma?.name ?? '']))
}

function recordOf(row: TargetRow): TargetRecord {
  return {
    id: row.target_id,
    session: row.session,
    ref: row.link,
    ...(row.route === null ? {} : {route: row.route}),
    width: row.width,
    height: row.height,
    scale: row.scale,
    widget: row.widget,
    createdAt: row.at,
  }
}

function rowKey(row: Pick<RowRow, 'node' | 'magnitude' | 'text' | 'width'>): string {
  return JSON.stringify([row.node, row.magnitude, row.text, row.width])
}

function rowOf(row: GateRow): Omit<RowRow, 'seq' | 'target_id' | 'run_id' | 'session' | 'round' | 'at' | 'repeat'> {
  return {
    id: row.id,
    node: row.node,
    source: row.source,
    selector: row.selector,
    kind: row.kind,
    name: row.name,
    magnitude: row.magnitude,
    width: row.width ?? null,
    text: row.text,
    property: row.property ?? null,
    expected: row.expected ?? null,
    actual: row.actual ?? null,
    delta: row.delta ?? null,
    token: row.token ?? null,
    component: row.component ?? null,
    specifier: row.specifier ?? null,
    kit_token: row.kitToken ?? null,
    design_token: row.designToken ?? null,
    confidence: row.confidence,
    margin: row.margin,
  }
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

function zipped(input: {dom: DomSite; cssom: CssomSite | undefined}): IdNode {
  const {dom, cssom} = input
  return {
    ...dom,
    cssom: cssom?.id === dom.id ? cssom.cssom : [],
    fom: [],
    children: dom.children.map((child, index) => zipped({dom: child, cssom: cssom?.children[index]})),
  }
}
