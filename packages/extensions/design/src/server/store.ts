import {and, asc, desc, eq, max} from 'drizzle-orm'
import type {Storage} from 'unstorage'
import {toolError, type ExtensionDb} from '@conciv/extension'
import {RoundSchema, type GateRow, type Mapping, type Round, type Store, type TargetRecord} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {attached} from './attached.js'
import type {designTables} from './tables.js'

export function createStore(input: {db: DesignDb; state: Storage; run: () => Promise<number | null>}): Store {
  const {state, run} = input
  const {orm, tables} = input.db
  const {targets, rounds, rows, fom, votes, tool_calls: toolCalls} = tables

  async function target(id: string): Promise<TargetRow | undefined> {
    const [found] = await orm.select().from(targets).where(eq(targets.target_id, id))
    return found
  }

  async function list(): Promise<TargetRecord[]> {
    return (await orm.select().from(targets).orderBy(asc(targets.at))).map(recordOf)
  }

  async function roundsOf(where: {id: string; round?: number}): Promise<Round[]> {
    const own = eq(rounds.target_id, where.id)
    const heads = await orm
      .select()
      .from(rounds)
      .where(where.round === undefined ? own : and(own, eq(rounds.round, where.round)))
      .orderBy(asc(rounds.seq))
    const listed = await orm.select().from(rows).where(eq(rows.target_id, where.id)).orderBy(asc(rows.seq))
    const byRound = Map.groupBy(listed, (row) => row.round)
    return heads.map((head) =>
      RoundSchema.parse({
        round: head.round,
        rows: (byRound.get(head.round) ?? []).map(gateRowOf),
        reflow: head.reflow,
        coverage: head.coverage,
        counts: head.counts,
        pixels: head.pixel_share === null ? null : {share: head.pixel_share},
        at: head.at,
        tree: head.tree,
      }),
    )
  }

  async function namesOf(id: string): Promise<Map<string, string>> {
    const found = await target(id)
    if (found === undefined) return new Map()
    return new Map([...walk(found.design.root)].map(({node}) => [node.id, node.figma?.name ?? '']))
  }

  async function latestFom(id: string): Promise<FomRow[]> {
    const [last] = await orm
      .select({round: max(fom.round)})
      .from(fom)
      .where(eq(fom.target_id, id))
    const round = last?.round ?? null
    if (round === null) return []
    return orm
      .select()
      .from(fom)
      .where(and(eq(fom.target_id, id), eq(fom.round, round)))
      .orderBy(asc(fom.seq))
  }

  async function mappingOf(id: string): Promise<Mapping> {
    const held = await latestFom(id)
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
    put: async ({design, image, session, route}) => {
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
        ids: null,
        image: path,
        at: Date.now(),
      }
      await orm.insert(targets).values(row).onConflictDoUpdate({target: targets.target_id, set: row})
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
    mapping: mappingOf,
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
    ids: async (id) => {
      const tree = (await target(id))?.ids ?? null
      if (tree === null) return null
      return {...tree, root: attached({node: tree.root, mapping: await mappingOf(id)})}
    },
    writeIds: async ({id, ids, round, revoted}) => {
      const runId = await run()
      const names = await namesOf(id)
      const before = await latestFom(id)
      const at = Date.now()
      orm.transaction((tx) => {
        const carried = new Map(before.map((row) => [`${row.id}/${row.node}`, row]))
        tx.update(targets)
          .set({ids: {...ids, root: attached({node: ids.root, mapping: {}})}})
          .where(eq(targets.target_id, id))
          .run()
        tx.delete(fom)
          .where(and(eq(fom.target_id, id), eq(fom.round, round)))
          .run()
        for (const {node: site} of walk(ids.root)) {
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
      })
    },
    writeRound: async ({id, round, live, diff}) => {
      const written = RoundSchema.parse(round)
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
        const own = {target_id: id, run_id: runId, round: written.round, at: written.at}
        tx.insert(rounds)
          .values({
            ...own,
            counts: written.counts,
            coverage: written.coverage,
            reflow: written.reflow,
            pixel_share: written.pixels?.share ?? null,
            tree: written.tree,
            live: livePath,
            diff: diffPath,
          })
          .run()
        for (const row of written.rows)
          tx.insert(rows)
            .values({...own, ...rowOf(row), repeat: repeats.get(rowKey({...row, width: row.width ?? null})) ?? 0})
            .run()
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

type RowRow = DesignDb['tables']['rows']['$inferSelect']

type FomRow = DesignDb['tables']['fom']['$inferSelect']

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
    confidence: row.confidence,
    margin: row.margin,
  }
}

function gateRowOf(row: RowRow): Record<string, unknown> {
  const {seq: _seq, target_id: _target, run_id: _run, round: _round, at: _at, repeat: _repeat, width, ...rest} = row
  return width === null ? rest : {...rest, width}
}

async function readRaw(input: {state: Storage; key: string | null}): Promise<Uint8Array | null> {
  if (input.key === null) return null
  const value: unknown = await input.state.getItemRaw(input.key).catch(() => null)
  return value instanceof Uint8Array ? value : null
}
