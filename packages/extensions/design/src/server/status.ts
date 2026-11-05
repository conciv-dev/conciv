import {isAbsolute, relative} from 'node:path'
import {keyBy, maxBy} from 'es-toolkit'
import {
  type CssDesigns,
  DESIGN_GUIDE,
  type DiffReport,
  type Item,
  type Judge,
  type Latest,
  type Projections,
  type Registrar,
  type Round,
  type Run,
  type StatusReport,
  type Store,
  type TargetRecord,
  UNANSWERED_HINT,
  type WatchInput,
  type WatchRow,
  type Words,
} from '../shared/defs.js'
import {aboveTolerance, designFamilies} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'

export function createProjections(input: Context): Projections {
  const context = input
  return {
    status: ({session, unanswered, rounds, latest}) => targetStatus({context, session, unanswered, rounds, latest}),
    watch: async ({query, session, latest}) => {
      const {store, judge} = context
      const record = await context.registrar.current(session)
      const settled = latest(record.id)
      const stored = await store.latest(record.id)
      const run = settled?.run ?? stored
      const rows = (run === null ? await designRows({store, id: record.id}) : runRows({run, settled})).filter((row) =>
        watchMatches({row, query}),
      )
      return {
        target: record.id,
        run: run?.id ?? null,
        live: settled !== undefined && settled.run.id !== stored?.id,
        counts: run === null ? {...judge.counts([]), unbuilt: rows.length} : judge.counts(run.root.children),
        rows: rows.slice(0, query.limit),
        truncated: Math.max(0, rows.length - query.limit),
      }
    },
    paths: (id) => targetPaths({context, id}),
    relative: (path) => reportPath({cwd: context.cwd, path}),
  }
}

type Context = {cwd: string; store: Store; judge: Judge; css: CssDesigns; registrar: Registrar; words: Words}

async function targetStatus(input: {
  context: Context
  session: string
  unanswered: (id: string) => boolean
  rounds: (id: string) => Round[]
  latest: (id: string) => Latest | undefined
}): Promise<StatusReport> {
  const {context} = input
  const {store, judge} = context
  const record = await store.current(input.session)
  if (record === null) return {targets: [], done: false}
  const settled = input.latest(record.id)
  const run = settled?.run ?? (await store.latest(record.id))
  const report = settled?.report ?? null
  const css = await context.css.load({id: record.id, decisions: await store.decisions(record.id)}).catch(() => null)
  const reregister = css === null
  const done = !reregister && (await finished({store, record, run, worse: judge.worse}))
  const sections =
    css === null ? [] : css.design.root.children.toSorted((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  const budgets = keyBy(judge.budgets({sections, items: [], rounds: input.rounds(record.id)}), (budget) => budget.id)
  const paths = targetPaths({context, id: record.id})
  return {
    ...(record.route === undefined ? {} : {route: record.route}),
    targets: [{id: record.id, width: record.width, ...runSummary(report)}],
    done,
    ...loopState({record, run, report}),
    ledger: judge.counts(run?.root.children ?? []),
    sections: sections.map((section) => ({
      id: section.id,
      kind: section.kind,
      line: context.words.line({node: section, scale: 1}),
      ledger: judge.counts(run?.root.children.filter((child) => child.node.id === section.id) ?? []),
      roundsUsed: budgets[section.id]?.roundsUsed ?? 0,
      ...withSimilarity(report?.sectionSimilarity[section.id]),
    })),
    ...(report === null ? {} : {changes: report.changes}),
    ...paths,
    ...statusNext({
      done,
      unanswered: input.unanswered(record.id),
      first: (run?.round ?? 0) === 0,
      ...paths,
      families: css === null ? [] : designFamilies([...walk({root: css.design.root})].map(({node}) => node)),
    }),
    ...(reregister ? {reregister} : {}),
  }
}

function runSummary(report: DiffReport | null): {mismatch: number | null; above: number; lastAt: number | null} {
  if (report === null) return {mismatch: null, above: 0, lastAt: null}
  return {mismatch: report.mismatch, above: aboveTolerance(report), lastAt: runTime(report)}
}

async function finished(input: {
  store: Store
  record: TargetRecord
  run: Run | null
  worse: (input: {a: number[]; b: number[]}) => boolean
}): Promise<boolean> {
  const {store, record, run, worse} = input
  if (run === null) return false
  if (run.stop === 'done') return true
  if (record.acceptedRun === undefined) return false
  const accepted = await store.run({id: record.id, run: record.acceptedRun})
  return accepted !== null && !worse({a: run.score, b: accepted.score})
}

function loopState(input: {record: TargetRecord; run: Run | null; report: DiffReport | null}): Partial<StatusReport> {
  const {record, run, report} = input
  const accepted = record.acceptedRun === undefined ? {} : {acceptedRun: record.acceptedRun}
  if (run === null) return accepted
  return {...accepted, score: run.score, round: run.round, stop: run.stop, ...withSimilarity(report?.similarity)}
}

function runRows(input: {run: Run; settled: Latest | undefined}): WatchRow[] {
  const {run, settled} = input
  const items = settled?.run.id === run.id ? settled.items : []
  return [...walk({root: run.root})].flatMap(({node, depth}): WatchRow[] =>
    depth === 0
      ? []
      : [
          {
            node: node.node.id,
            ref: node.node.id,
            kind: node.node.kind,
            text: node.node.kind === 'text' ? node.node.text : null,
            box: node.node.box,
            status: node.status,
            key: node.live?.key ?? null,
            source: node.live?.source ?? null,
            path: node.live?.path ?? null,
            confidence: node.live === null ? null : node.confidence,
            item: worstSentence({items, node: node.node.id}),
          },
        ],
  )
}

async function designRows(input: {store: Store; id: string}): Promise<WatchRow[]> {
  const design = await input.store.design(input.id)
  return [...walk({root: design.root})].flatMap(({node, depth}): WatchRow[] =>
    depth === 0
      ? []
      : [
          {
            node: node.id,
            ref: node.id,
            kind: node.kind,
            text: node.kind === 'text' ? node.text : null,
            box: node.box,
            status: 'unbuilt',
            key: null,
            source: null,
            path: null,
            confidence: null,
            item: null,
          },
        ],
  )
}

function worstSentence(input: {items: Item[]; node: string}): string | null {
  return (
    maxBy(
      input.items.filter((item) => item.node === input.node && item.stage !== null),
      (item) => item.size,
    )?.sentence ?? null
  )
}

function statusNext(input: {
  done: boolean
  unanswered: boolean
  first: boolean
  designPath: string
  placeholderPath: string
  families: string[]
}): {
  next?: string
} {
  if (input.unanswered) return {next: UNANSWERED_HINT}
  if (input.done) return {}
  if (input.first) {
    return {
      next: `read ${input.designPath} for the whole design before building; the brief lists what to fix first; copy ${input.placeholderPath} into the page's source and use <Placeholder kind=…> for every image and icon line${fontsPhrase(input.families)}`,
    }
  }
  return {next: DESIGN_GUIDE}
}

function fontsPhrase(families: string[]): string {
  if (families.length === 0) return ''
  return `; the design sets its text in ${families.join(', ')}: load these fonts before building`
}

function withSimilarity(similarity: number | undefined): {similarity?: number} {
  return similarity === undefined ? {} : {similarity}
}

function runTime(report: DiffReport): number | null {
  const at = Number((report.livePath.split('/').at(-2) ?? '').split('-')[0])
  return Number.isFinite(at) ? at : null
}

function watchMatches(input: {row: WatchRow; query: WatchInput}): boolean {
  const {row, query} = input
  if (query.node !== undefined && row.node !== query.node) return false
  if (query.ref !== undefined && row.ref !== query.ref) return false
  if (query.key !== undefined && row.key !== query.key) return false
  return query.status === undefined || row.status === query.status
}

function reportPath(input: {cwd: string; path: string}): string {
  return isAbsolute(input.path) ? relative(input.cwd, input.path) : input.path
}

function targetPaths(input: {context: Context; id: string}): {designPath: string; placeholderPath: string} {
  const {context, id} = input
  const path = (key: string): string => reportPath({cwd: context.cwd, path: context.store.path(key) ?? key})
  return {designPath: path(`${id}:design.txt`), placeholderPath: path(`${id}:placeholder.tsx`)}
}
