import {and, asc, desc, eq, inArray, isNotNull, max, type SQL} from 'drizzle-orm'
import {keyBy, omit, uniqBy} from 'es-toolkit'
import type {SQLiteColumn} from 'drizzle-orm/sqlite-core'
import type {Storage} from 'unstorage'
import {toolError} from '@conciv/extension'
import {RoundSchema, type GateRow, type Mapping, type Round, type TargetRecord} from '../shared/defs.js'
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
import {storeArtifacts} from './runs/artifacts.js'
import {designConfig} from '../shared/tolerances.js'

export function createStore(input: {
  db: DesignDb
  home: string
  state: Storage
  runs: {
    of: (sessionId: string) => Promise<number | null>
    latest: () => Promise<{sessionId: string; run: number} | null>
  }
  project: Promise<string>
  catalog: Catalog
}): Store {
  const {state, runs, catalog} = input
  const {orm, tables} = input.db
  const {
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
          .values({...look, run_id: run})
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
      orm.select().from(rounds).where(keyed(rounds, found)).orderBy(asc(rounds.seq)),
      orm.select().from(rows).where(keyed(rows, found)).orderBy(asc(rows.seq)),
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

  return {
    put: async ({design, image, session, route, widget = 'hidden', notes: told = []}) => {
      const run = await runs.of(session)
      if (run === null) throw toolError('no-target', {message: 'no run is open for this session; call design_get'})
      const path = `${run}/${design.id}/${TARGET_IMAGE}`
      await state.setItemRaw(path, image)
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
        image: path,
        widget,
        unsettled: 0,
        lead: null,
        at: Date.now(),
      }
      orm.transaction((tx) => {
        tx.insert(targets)
          .values(row)
          .onConflictDoUpdate({target: [targets.run_id, targets.target_id], set: omit(row, ['lead'])})
          .run()
        tx.delete(nodes).where(keyed(nodes, row)).run()
        for (const {gradient: _gradient, lineAuto: _auto, ...look} of nodeLooks(design))
          tx.insert(nodes)
            .values({...look, target_id: design.id, run_id: row.run_id})
            .run()
        for (const text of told) tx.insert(notes).values({target_id: design.id, run_id: row.run_id, text}).run()
      })
      return recordOf(row)
    },
    design: async (id) => {
      const found = await target(id)
      if (found !== undefined) return found.design
      throw toolError('no-target', {message: `the stored design ${id} is unreadable; call design_get again`})
    },
    image: async ({id, round, kind}) => {
      if (round === undefined) return readRaw({state, key: (await target(id))?.image ?? null})
      const found = await target(id)
      if (found === undefined) return null
      const [head] = await orm
        .select()
        .from(rounds)
        .where(and(keyed(rounds, found), eq(rounds.round, round)))
        .orderBy(desc(rounds.seq))
        .limit(1)
      return readRaw({state, key: (kind === 'diff' ? head?.diff : head?.live) ?? null})
    },
    mapping: (id) => mappingOf({id}),
    sources: async (id) =>
      uniqBy(await fomAt({id}), (row) => row.id).flatMap((row) => {
        const source = row.source ?? row.site
        return source === null ? [] : [source]
      }),
    writeRelation: async ({id, round, tree}) => {
      const runId = (await runOf(id)).run
      const {relation, write} = await relateRound({
        db: input.db,
        catalog,
        targetId: id,
        runId,
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
      const runId = (await runOf(id)).run
      const names = await namesOf(id)
      const at = Date.now()
      later({
        key: roundKey({run: runId, id, round}),
        write: (tx) => {
          for (const ballot of cast)
            tx.insert(votes)
              .values({...ballot, name: names.get(ballot.node) ?? null, target_id: id, run_id: runId, round, at})
              .run()
        },
      })
    },
    writeLabel: async ({target: targetId, round, node, id, verdict, by}) => {
      await orm
        .insert(labels)
        .values({target_id: targetId, run_id: (await runOf(targetId)).run, round, node, id, verdict, by})
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
      const [stored] = await orm
        .select({ids: rounds.ids, round: rounds.round})
        .from(rounds)
        .where(and(keyed(rounds, found), round === undefined ? isNotNull(rounds.ids) : eq(rounds.round, round)))
        .orderBy(desc(rounds.seq))
        .limit(1)
      if (stored?.ids === undefined || stored.ids === null) return null
      return {
        ...stored.ids,
        root: attached({node: stored.ids.root, mapping: await mappingOf({id, round: stored.round})}),
      }
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
    writeRound: async ({id, round, live, diff, notes: told = [], ids, artifacts}) => {
      const written = RoundSchema.parse(round)
      const names = await namesOf(id)
      const before = await fomAt({id})
      const {run: runId, row: found} = await runOf(id)
      const livePath = live.length > 0 ? `${runId}/${id}/live/${round.round}.png` : null
      const diffPath = diff.length > 0 ? `${runId}/${id}/diff/${round.round}.png` : null
      if (livePath !== null) await state.setItemRaw(livePath, live)
      if (diffPath !== null) await state.setItemRaw(diffPath, diff)
      const earlier = await orm
        .select()
        .from(rows)
        .where(and(keyed(rows, found), eq(rows.round, written.round - 1)))
      const repeats = new Map(earlier.map((row) => [rowKey(row), row.repeat + 1]))
      orm.transaction((tx) => {
        const own = {target_id: id, run_id: runId, round: written.round}
        for (const text of told)
          tx.insert(notes)
            .values({...own, text})
            .run()
        const {counts, coverage, progress} = written
        tx.insert(rounds)
          .values({
            ...own,
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
            pixel_before: progress?.pixels.before ?? null,
            closed: progress?.closed ?? null,
            opened: progress?.opened ?? null,
            kept: progress?.kept.length ?? null,
            gained: progress?.mapped.gained.length ?? null,
            lost: progress?.mapped.lost.length ?? null,
            changed_ratio: progress?.changed?.ratio ?? null,
            changed_regions: progress?.changed?.count ?? null,
            note: progress?.note ?? null,
            tree: written.tree,
            verdict: written.verdict,
            unsettled: written.unsettled,
            broken: written.broken,
            broken_by: written.brokenBy,
            live: livePath,
            diff: diffPath,
            ids: ids === undefined ? null : {...ids.tree, root: attached({node: ids.tree.root, mapping: {}})},
          })
          .run()
        if (ids !== undefined) writeFom({tx, fom, id, runId, round: written.round, ids, names, before, at: written.at})
        if (artifacts !== undefined)
          storeArtifacts({
            tx,
            home: input.home,
            runId,
            folder: `${runId}/${id}`,
            artifacts: checkArtifacts({...artifacts, round: written.round}),
          })
        const key = roundKey({run: runId, id, round: written.round})
        for (const write of pending.get(key) ?? []) write(tx)
        pending.delete(key)
        for (const row of written.rows)
          tx.insert(rows)
            .values({
              ...own,
              at: written.at,
              ...rowOf(row),
              repeat: repeats.get(rowKey({...row, width: row.width ?? null})) ?? 0,
            })
            .run()
        for (const [kind, listed] of [
          ['missing', coverage.missing],
          ['not_rendered', coverage.notRendered],
          ['dupe', coverage.dupes],
        ] as const)
          for (const node of listed)
            tx.insert(missing)
              .values({...own, node, kind})
              .run()
        for (const tied of coverage.candidates)
          for (const {selector, score} of tied.candidates)
            tx.insert(candidates)
              .values({...own, node: tied.node, selector, score})
              .run()
        for (const {width, from} of written.reflow.widths) {
          const result = written.reflow.results.find((entry) => entry.width === width)
          const measured = {root_height: result?.rootHeight ?? 0, overflow_x: result?.overflowX ?? false}
          for (const named of from)
            tx.insert(widths)
              .values({...own, width, from: named, ...measured})
              .run()
        }
        for (const region of progress?.changed?.regions ?? []) {
          const {x, y, w, h} = region.box
          const at = {...own, x, y, width: w, height: h, truncated: progress?.changed?.truncated ?? false}
          const named = region.ids.length === 0 ? [null] : region.ids
          for (const entry of named)
            tx.insert(regions)
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
      })
      return written
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

const TARGET_IMAGE = 'target.png'

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

function rowOf(row: GateRow): Omit<RowRow, 'seq' | 'target_id' | 'run_id' | 'round' | 'at' | 'repeat'> {
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
    token: row.token ?? null,
    component: row.component ?? null,
    specifier: row.specifier ?? null,
    kit_token: row.kitToken ?? null,
    design_token: row.designToken ?? null,
    confidence: row.confidence,
    margin: row.margin,
  }
}

async function readRaw(input: {state: Storage; key: string | null}): Promise<Uint8Array | null> {
  if (input.key === null) return null
  const value: unknown = await input.state.getItemRaw(input.key).catch(() => null)
  return value instanceof Uint8Array ? value : null
}

function checkArtifacts(input: {design: Uint8Array; shots: {width: number; png: Uint8Array}[]; round: number}) {
  const {lifetimes} = designConfig.runs
  return input.shots.flatMap(({width, png}) =>
    (
      [
        ['design', input.design],
        ['screenshot', png],
      ] as const
    ).map(([kind, bytes]) => ({
      kind,
      width,
      name: `${kind}-${input.round}-${width}.png`,
      bytes,
      lifetime: String(lifetimes[kind]),
    })),
  )
}
