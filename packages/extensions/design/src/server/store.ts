import {and, asc, desc, eq, isNotNull, max} from 'drizzle-orm'
import type {Storage} from 'unstorage'
import {toolError, type ExtensionDb} from '@conciv/extension'
import {RoundSchema, type GateRow, type IdTree, type Mapping, type Round, type TargetRecord} from '../shared/defs.js'
import type {Store} from '../shared/store.js'
import {walk} from '../shared/tree.js'
import {attached} from './attached.js'
import {nodeLooks} from './node-look.js'
import type {designTables} from './tables.js'

export function createStore(input: {db: DesignDb; state: Storage; run: () => Promise<number | null>}): Store {
  const {state, run} = input
  const {orm, tables} = input.db
  const {
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
  } = tables

  async function target(id: string): Promise<TargetRow | undefined> {
    const [found] = await orm.select().from(targets).where(eq(targets.target_id, id))
    return found
  }

  async function list(): Promise<TargetRecord[]> {
    return (await orm.select().from(targets).orderBy(asc(targets.at))).map(recordOf)
  }

  async function roundsOf(where: {id: string; round?: number}): Promise<Round[]> {
    const [heads, listedRows, listedMissing, listedCandidates, listedWidths, listedRegions, names] = await Promise.all([
      orm.select().from(rounds).where(eq(rounds.target_id, where.id)).orderBy(asc(rounds.seq)),
      orm.select().from(rows).where(eq(rows.target_id, where.id)).orderBy(asc(rows.seq)),
      orm.select().from(missing).where(eq(missing.target_id, where.id)).orderBy(asc(missing.seq)),
      orm.select().from(candidates).where(eq(candidates.target_id, where.id)).orderBy(asc(candidates.seq)),
      orm.select().from(widths).where(eq(widths.target_id, where.id)).orderBy(asc(widths.seq)),
      orm.select().from(regions).where(eq(regions.target_id, where.id)).orderBy(asc(regions.seq)),
      namesOf(where.id),
    ])
    const byRound = <T extends {round: number}>(found: T[]) => Map.groupBy(found, (entry) => entry.round)
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
    if (found === undefined) return new Map()
    return new Map([...walk(found.design.root)].map(({node}) => [node.id, node.figma?.name ?? '']))
  }

  async function fomAt(where: {id: string; round?: number}): Promise<FomRow[]> {
    const [last] = await orm
      .select({round: max(fom.round)})
      .from(fom)
      .where(eq(fom.target_id, where.id))
    const round = where.round ?? last?.round ?? null
    if (round === null) return []
    return orm
      .select()
      .from(fom)
      .where(and(eq(fom.target_id, where.id), eq(fom.round, round)))
      .orderBy(asc(fom.seq))
  }

  function writeFom(written: {
    tx: Transaction
    id: string
    runId: number | null
    round: number
    ids: {tree: IdTree; revoted: Record<string, string>}
    names: Map<string, string>
    before: FomRow[]
    at: number
  }): void {
    const {tx, id, runId, round, names, at} = written
    const {tree, revoted} = written.ids
    const carried = new Map(written.before.map((row) => [`${row.id}/${row.node}`, row]))
    tx.delete(fom)
      .where(and(eq(fom.target_id, id), eq(fom.round, round)))
      .run()
    for (const {node: site} of walk(tree.root)) {
      for (const entry of site.fom) {
        const reason = revoted[site.id]
        const previous = carried.get(`${site.id}/${entry.nodeId}`)
        const {at: loc} = site.src
        tx.insert(fom)
          .values({
            target_id: id,
            run_id: runId,
            id: site.id,
            node: entry.nodeId,
            name: names.get(entry.nodeId) ?? null,
            instance: entry.instance,
            source: loc === null ? null : `${loc.file}:${loc.line}:${loc.column}`,
            confidence: entry.confidence,
            margin: entry.margin,
            round,
            voted_round: entry.round,
            revoted_round: reason === undefined ? (previous?.revoted_round ?? null) : round,
            reason: reason ?? previous?.reason ?? null,
            at,
          })
          .run()
      }
    }
  }

  async function mappingOf(where: {id: string; round?: number}): Promise<Mapping> {
    const held = await fomAt(where)
    return Object.fromEntries(
      Object.entries(Object.groupBy(held, (row) => row.id)).map(([key, grouped]) => [
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
    put: async ({design, image, session, route, notes: told = []}) => {
      const path = `${design.id}/${TARGET_IMAGE}`
      await state.setItemRaw(path, image)
      const row = {
        target_id: design.id,
        run_id: await run(),
        session,
        link: design.source.ref,
        route: route ?? null,
        width: design.viewport.width,
        height: design.viewport.height,
        scale: design.scale,
        design,
        image: path,
        unsettled: 0,
        at: Date.now(),
      }
      orm.transaction((tx) => {
        tx.insert(targets).values(row).onConflictDoUpdate({target: targets.target_id, set: row}).run()
        tx.delete(nodes).where(eq(nodes.target_id, design.id)).run()
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
      const [head] = await roundsHead({id, round})
      return readRaw({state, key: (kind === 'diff' ? head?.diff : head?.live) ?? null})
    },
    mapping: (id) => mappingOf({id}),
    writeVotes: async ({id, round, votes: cast}) => {
      const runId = await run()
      const names = await namesOf(id)
      const at = Date.now()
      orm.transaction((tx) => {
        for (const ballot of cast)
          tx.insert(votes)
            .values({...ballot, name: names.get(ballot.node) ?? null, target_id: id, run_id: runId, round, at})
            .run()
      })
    },
    writeToolCall: async ({session, tool, round, input: given, replyBytes, durationMs, error}) => {
      const [own] = await orm
        .select({id: targets.target_id})
        .from(targets)
        .where(eq(targets.session, session))
        .orderBy(desc(targets.at))
        .limit(1)
      await orm.insert(toolCalls).values({
        target_id: own?.id ?? null,
        run_id: await run(),
        tool,
        round,
        input: given,
        reply_bytes: replyBytes,
        duration_ms: durationMs,
        error,
        at: Date.now(),
      })
    },
    ids: async ({id, round}) => {
      const [held] = await orm
        .select({ids: rounds.ids, round: rounds.round})
        .from(rounds)
        .where(and(eq(rounds.target_id, id), round === undefined ? isNotNull(rounds.ids) : eq(rounds.round, round)))
        .orderBy(desc(rounds.seq))
        .limit(1)
      if (held?.ids === undefined || held.ids === null) return null
      return {...held.ids, root: attached({node: held.ids.root, mapping: await mappingOf({id, round: held.round})})}
    },
    looks: async (id) =>
      (await orm.select().from(nodes).where(eq(nodes.target_id, id)).orderBy(asc(nodes.seq))).map(
        ({seq: _seq, target_id: _target, run_id: _run, ...look}) => look,
      ),
    unsettledCount: async (id) => (await target(id))?.unsettled ?? 0,
    writeUnsettledCount: async ({id, count}) => {
      await orm.update(targets).set({unsettled: count}).where(eq(targets.target_id, id))
    },
    writeRound: async ({id, round, live, diff, notes: told = [], ids}) => {
      const written = RoundSchema.parse(round)
      const names = await namesOf(id)
      const before = await fomAt({id})
      const livePath = live.length > 0 ? `${id}/live/${round.round}.png` : null
      const diffPath = diff.length > 0 ? `${id}/diff/${round.round}.png` : null
      if (livePath !== null) await state.setItemRaw(livePath, live)
      if (diffPath !== null) await state.setItemRaw(diffPath, diff)
      const runId = await run()
      const earlier = await orm
        .select()
        .from(rows)
        .where(and(eq(rows.target_id, id), eq(rows.round, written.round - 1)))
      const repeats = new Map(earlier.map((row) => [rowKey(row), row.repeat + 1]))
      orm.transaction((tx) => {
        const own = {target_id: id, run_id: runId, round: written.round}
        if (ids !== undefined) writeFom({tx, id, runId, round: written.round, ids, names, before, at: written.at})
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
            live: livePath,
            diff: diffPath,
            ids: ids === undefined ? null : {...ids.tree, root: attached({node: ids.tree.root, mapping: {}})},
          })
          .run()
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
    clear: async (id) => {
      orm.transaction((tx) => {
        tx.delete(targets).where(eq(targets.target_id, id)).run()
        tx.delete(rounds).where(eq(rounds.target_id, id)).run()
        tx.delete(rows).where(eq(rows.target_id, id)).run()
        tx.delete(fom).where(eq(fom.target_id, id)).run()
        tx.delete(votes).where(eq(votes.target_id, id)).run()
        for (const table of [missing, candidates, widths, regions, nodes])
          tx.delete(table).where(eq(table.target_id, id)).run()
      })
      await Promise.all((await state.getKeys(id)).map((key) => state.removeItem(key)))
    },
    current: async (session) => {
      const records = await list()
      return records.filter((entry) => entry.session === session).at(-1) ?? records.at(-1) ?? null
    },
    list,
  }

  function roundsHead(where: {id: string; round: number}) {
    return orm
      .select()
      .from(rounds)
      .where(and(eq(rounds.target_id, where.id), eq(rounds.round, where.round)))
      .orderBy(desc(rounds.seq))
      .limit(1)
  }
}

type DesignDb = ExtensionDb<ReturnType<typeof designTables>>

type TargetRow = DesignDb['tables']['targets']['$inferSelect']

type Tables = DesignDb['tables']

type RowRow = Tables['rows']['$inferSelect']

type Stored = {
  head: Tables['rounds']['$inferSelect']
  before: Tables['rounds']['$inferSelect'] | null
  rows: RowRow[]
  missing: Tables['missing']['$inferSelect'][]
  missingBefore: Tables['missing']['$inferSelect'][]
  candidates: Tables['candidates']['$inferSelect'][]
  widths: Tables['widths']['$inferSelect'][]
  regions: Tables['regions']['$inferSelect'][]
  names: Map<string, string>
}

type FomRow = DesignDb['tables']['fom']['$inferSelect']

type Transaction = Parameters<Parameters<DesignDb['orm']['transaction']>[0]>[0]

const TARGET_IMAGE = 'target.png'

function recordOf(row: TargetRow): TargetRecord {
  return {
    id: row.target_id,
    session: row.session,
    ref: row.link,
    ...(row.route === null ? {} : {route: row.route}),
    width: row.width,
    height: row.height,
    scale: row.scale,
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
    confidence: row.confidence,
    margin: row.margin,
  }
}

function gateRowOf(row: RowRow): Record<string, unknown> {
  const {
    seq: _seq,
    target_id: _target,
    run_id: _run,
    round: _round,
    at: _at,
    repeat: _repeat,
    width,
    token,
    ...rest
  } = row
  return {...rest, ...(width === null ? {} : {width}), ...(token === null ? {} : {token})}
}

async function readRaw(input: {state: Storage; key: string | null}): Promise<Uint8Array | null> {
  if (input.key === null) return null
  const value: unknown = await input.state.getItemRaw(input.key).catch(() => null)
  return value instanceof Uint8Array ? value : null
}

function roundOf(input: Stored): Round {
  const {head, rows: listed} = input
  const kinds = (kind: string, from: Stored['missing']): string[] =>
    from.filter((entry) => entry.kind === kind).map((entry) => entry.node)
  const tied = Map.groupBy(input.candidates, (entry) => entry.node)
  const named = Map.groupBy(input.widths, (entry) => entry.width)
  return RoundSchema.parse({
    round: head.round,
    rows: listed.map(gateRowOf),
    reflow: {
      widths: [...named].map(([width, entries]) => ({width, from: entries.map((entry) => entry.from)})),
      results: [...named].map(([width, [first]]) => ({
        width,
        rootHeight: first?.root_height ?? 0,
        sticksOut: [],
        overflowX: first?.overflow_x ?? false,
        overlaps: [],
        tags: [],
        rows: listed.filter((row) => row.magnitude === 'reflow' && row.width === width).map(gateRowOf),
      })),
    },
    coverage: {
      nodes: head.nodes,
      mapped: head.mapped,
      rendered: head.rendered,
      missing: kinds('missing', input.missing),
      ...(head.unsettled === null
        ? {}
        : {gone: kinds('missing', input.missing).map((id) => ({id, name: input.names.get(id) ?? ''}))}),
      notRendered: kinds('not_rendered', input.missing),
      dupes: kinds('dupe', input.missing),
      revoted: head.revoted,
      candidates: [...tied].map(([node, entries]) => ({
        node,
        candidates: entries.map(({selector, score}) => ({selector, score})),
      })),
    },
    counts: {
      much: head.much,
      noticeably: head.noticeably,
      slightly: head.slightly,
      pins: head.pins,
      other: head.other,
      rows: head.rows_count,
      reflow: head.reflow,
      paint: head.paint,
    },
    pixels: head.pixel_share === null ? null : {share: head.pixel_share},
    progress: progressOf(input),
    at: head.at,
    tree: head.tree,
    verdict: head.verdict,
    unsettled: head.unsettled,
  })
}

function progressOf(input: Stored): Round['progress'] {
  const {head} = input
  if (head.closed === null || head.opened === null) return null
  const now = input.missing.filter((entry) => entry.kind === 'missing').map((entry) => entry.node)
  const before = input.missingBefore.filter((entry) => entry.kind === 'missing').map((entry) => entry.node)
  return {
    closed: head.closed,
    opened: head.opened,
    kept: input.rows
      .filter((row) => row.repeat > 0)
      .map((row) => ({node: row.node, id: row.id, text: row.text, repeat: row.repeat})),
    mapped: {
      gained: before.filter((node) => !now.includes(node)),
      lost: now.filter((node) => !before.includes(node)),
    },
    pixels: {now: head.pixel_share, before: head.pixel_before},
    changed:
      head.changed_ratio === null
        ? null
        : {
            ratio: head.changed_ratio,
            regions: regionsOf(input.regions),
            truncated: input.regions.some((entry) => entry.truncated),
            count: head.changed_regions ?? 0,
          },
    note: head.note,
  }
}

function regionsOf(stored: Stored['regions']): NonNullable<NonNullable<Round['progress']>['changed']>['regions'] {
  const grouped = stored.reduce<Stored['regions'][]>((groups, entry) => {
    const last = groups.at(-1)
    const first = last?.[0]
    const same =
      first !== undefined &&
      first.x === entry.x &&
      first.y === entry.y &&
      first.width === entry.width &&
      first.height === entry.height
    return same && last !== undefined ? [...groups.slice(0, -1), [...last, entry]] : [...groups, [entry]]
  }, [])
  return grouped.map((group) => {
    const [first] = group
    return {
      box: {x: first?.x ?? 0, y: first?.y ?? 0, w: first?.width ?? 0, h: first?.height ?? 0},
      ids: group.flatMap((entry) =>
        entry.id === null
          ? []
          : [{id: entry.id, node: entry.node, name: entry.name, source: entry.source, overlap: entry.overlap ?? 0}],
      ),
    }
  })
}
