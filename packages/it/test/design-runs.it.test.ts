import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {catalogSources, closeHomeDb, openHomeDb, sourceCatalog} from '@conciv/db'
import {openStore} from '../../extensions/design/src/server/runs/open-store.js'
import {storeSources} from '../../extensions/design/src/server/runs/sources.js'
import {storeTables} from '../../extensions/design/src/server/runs/store-tables.js'

type Store = ReturnType<typeof openStore>

type Sources = ReturnType<typeof catalogSources>

async function withStore<T>(run: (input: {store: Store; sources: Sources}) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), 'conciv-runs-home-'))
  const store = openStore(home)
  const homeOrm = openHomeDb(home)
  const sources = catalogSources({
    orm: homeOrm,
    sources: sourceCatalog({extension: 'design', sources: storeSources(), home}),
  })
  try {
    return await run({store, sources})
  } finally {
    closeHomeDb(homeOrm)
    store.close()
    await rm(home, {recursive: true, force: true})
  }
}

const NamedSchema = z.array(z.looseObject({name: z.string()}))
const ForeignSchema = z.array(z.looseObject({table: z.string(), from: z.string()}))

function pragma(input: {store: Store; statement: string}): unknown[] {
  return input.store.orm.$client.prepare(input.statement).all()
}

const STORED = [
  'targets',
  'rounds',
  'missing',
  'candidates',
  'widths',
  'regions',
  'rows',
  'fom',
  'nodes',
  'votes',
  'tool_calls',
  'runs',
  'labels',
  'node_components',
  'notes',
  'artifacts',
  'lanes',
  'judgements',
  'reports',
]

const VIEWS = [
  'run_summary',
  'round_rows',
  'lowest_rendered',
  'page_height_rows',
  'broken_rounds',
  'mispairs',
  'lost_components',
  'hint_vs_drawn',
  'kit_per_round',
  'judged',
  'wave_summary',
]

function seededRuns(store: Store): number[] {
  const {runs, targets, rounds} = storeTables
  const seeds = [
    {verdict: 'done' as const, cost: 1, rows: 2, pixels: 0.1, rendered: 5},
    {verdict: 'not-yet' as const, cost: 3, rows: 4, pixels: 0.3, rendered: 7},
  ]
  return seeds.map((seed, index) => {
    const [run] = store.orm
      .insert(runs)
      .values({
        model: 'm',
        prompt_head: 'p',
        started: 0,
        ended: 60_000,
        cost: seed.cost,
        verdict: seed.verdict,
        wave: 'thirty',
        lane: `figma7-${index}`,
      })
      .returning()
      .all()
    if (run === undefined) throw new Error('no run row')
    store.orm
      .insert(targets)
      .values({
        target_id: 't',
        run_id: run.run_id,
        session: 's',
        link: 'l',
        width: 390,
        height: 800,
        scale: 1,
        design: {
          id: 't',
          source: {kind: 'figma', ref: 'key/1:2'},
          viewport: {width: 390, height: 800},
          scale: 1,
          root: {
            id: '1:2',
            hash: '1:2',
            box: {x: 0, y: 0, w: 390, h: 800},
            kind: 'box',
            border: null,
            radius: 0,
            children: [],
          },
        },
        image: 'i',
        at: 0,
      })
      .run()
    store.orm
      .insert(rounds)
      .values({
        target_id: 't',
        run_id: run.run_id,
        round: 1,
        rows_count: seed.rows,
        pixel_share: seed.pixels,
        nodes: 9,
        rendered: seed.rendered,
        tree: '',
        verdict: seed.verdict,
        at: 0,
      })
      .run()
    return run.run_id
  })
}

describe('the runs store', () => {
  it('lists every stored table and every view as a source, each readable', async () => {
    await withStore(async ({sources}) => {
      const expected = [...STORED.map((name) => `design_stored_${name}`), ...VIEWS.map((name) => `design_${name}`)]
      expect(new Set(sources.list().map((source) => source.name))).toEqual(new Set(expected))
      const read = await Promise.all(expected.map((from) => sources.read({from, limit: 1})))
      expect(read).toEqual(expected.map(() => []))
    })
  })

  it('answers wave_summary per wave and width with the done count and the medians', async () => {
    await withStore(async ({store, sources}) => {
      seededRuns(store)
      expect(await sources.read({from: 'design_wave_summary', where: 'wave == "thirty"'})).toEqual([
        {
          wave: 'thirty',
          width: 390,
          runs: 2,
          done: 1,
          median_rows: 3,
          median_pixels: 0.2,
          median_cost: 2,
          median_lowest_rendered: 6,
        },
      ])
    })
  })

  it('takes a judgement through the house write, refuses a score of six, and joins it in judged', async () => {
    await withStore(async ({store, sources}) => {
      const [run] = seededRuns(store)
      const judgement = {run, target: 't', width: 390, reason: 'close', judge_model: 'opus', at: 1}
      await sources.write({into: 'design_stored_judgements', values: {...judgement, score: 4}})
      await expect(
        sources.write({into: 'design_stored_judgements', values: {...judgement, judge_model: 'other', score: 6}}),
      ).rejects.toMatchObject({cause: {message: 'CHECK constraint failed: judgements_score'}})
      expect(
        await sources.read({
          from: 'design_judged',
          where: 'score != null',
          select: ['run', 'lane', 'verdict', 'score'],
        }),
      ).toEqual([{run, lane: 'figma7-0', verdict: 'done', score: 4}])
      await expect(sources.write({into: 'design_stored_notes', values: {target: 't', run, text: 'x'}})).rejects.toThrow(
        'design_stored_notes is read-only',
      )
    })
  })

  it('keys every child row to its run, target and round, and indexes the round lookups', async () => {
    await withStore(async ({store}) => {
      const names = (statement: string) => NamedSchema.parse(pragma({store, statement})).map((entry) => entry.name)
      const parents = (table: string) =>
        ForeignSchema.parse(pragma({store, statement: `PRAGMA foreign_key_list(${table})`})).map((entry) => entry.table)
      expect(names('PRAGMA index_list(design_rows)')).toEqual(expect.arrayContaining(['rows_by_round', 'rows_by_node']))
      expect(new Set(parents('design_rounds'))).toEqual(new Set(['design_runs', 'design_targets']))
      expect(new Set(parents('design_rows'))).toEqual(new Set(['design_runs', 'design_targets', 'design_rounds']))
      expect(names('PRAGMA table_info(design_tool_calls)')).toContain('reply')
      expect(() =>
        store.orm.$client.exec(
          `INSERT INTO design_runs (model, prompt_head, started, verdict) VALUES ('m', 'p', 1, 'fine')`,
        ),
      ).toThrow('CHECK constraint failed: runs_verdict')
    })
  })
})
