import {createHash} from 'node:crypto'
import {relative} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {keyBy, maxBy, omit, uniqBy} from 'es-toolkit'
import {isPageVerbError, toolError} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {isSessionId, type SessionId} from '@conciv/protocol/chat-types'
import {
  DESIGN_GUIDE,
  DiffInputSchema,
  DiffReportSchema,
  NO_CHANGES,
  NO_TARGET_MESSAGE,
  TimingsSchema,
  UNANSWERED_HINT,
  type Decision,
  type DesignNode,
  type DesignPage,
  type DesignRuntime,
  type DiffInput,
  type DiffReport,
  type Differ,
  type Item,
  type Lap,
  type Latest,
  type Match,
  type Measurer,
  type Raster,
  type Round,
  type Run,
  type Runner,
  type RunJob,
  type Settled,
  type StatusReport,
  type Store,
  type TargetRecord,
  type Twin,
  type WatchInput,
  type WatchReport,
  type WatchRow,
  type XrayLink,
  TWIN_SEPARATOR,
} from '../shared/defs.js'
import {aboveTolerance, designFamilies, TOLERANCES} from '../shared/tolerances.js'
import {find, walk} from '../shared/tree.js'
import {createRunner} from './runner.js'

export function createDiffer(input: {
  runtime: DesignRuntime
  page: DesignPage
  bundler: BundlerBridge | undefined
}): Differ {
  const {runtime, page, bundler} = input
  const {store} = runtime
  const history = createHistory()
  const runner = createRunner(runtime)
  const tab = (session: SessionId): ServerToolPageAccess => ({
    call: (name, query) => page.ask({sessionId: session, name, input: query}),
  })
  const latest = new Map<string, Settled>()
  const unanswered = new Set<string>()
  const runs = createRuns({
    execute: ({job, touched}) =>
      answeredDiff({job, touched, runtime, runner, page: tab(job.session), history, latest, unanswered}),
  })
  const edits = watchSettled({
    bundler,
    store,
    page,
    refresh: ({session}) => refreshSession({store, runs, session}),
    touch: ({file}) => runs.touch({file: relative(runtime.cwd, file)}),
  })
  return {
    register: async ({input: target, session}) => {
      const previous = await store.current(session)
      const result = await runtime.registrar.register({input: target, session, page: tab(session)})
      if (previous?.id !== result.id || history.rounds(result.id).length === 0) history.reset(result.id)
      const first = await runs.trigger({id: result.id, session, observe: false, input: DEFAULT_DIFF}).catch(() => null)
      await linkTwins({store, id: result.id, session})
      return first === null ? result : {...result, stage: first.stage, brief: first.brief}
    },
    run: async ({input: query, session}) => {
      await edits.quiet()
      const record = await runtime.registrar.current(session)
      const section = query.section === undefined ? null : await knownSection({runtime, runner, id: record.id, query})
      const report = await runs.trigger({id: record.id, session, observe: true, input: query})
      if (section === null) return report
      const settled = latest.get(record.id)
      const run = settled?.run ?? (await store.latest(record.id))
      return runtime.judge.section({
        report,
        section,
        judging: settled?.judging,
        measured: settled?.measured ?? [],
        rounds: history.rounds(record.id),
        counts: runtime.judge.counts(run?.root.children.filter((child) => child.node.id === section.id) ?? []),
      })
    },
    refresh: ({session}) => refreshSession({store, runs, session}),
    capture: ({id, session}) => runs.trigger({id, session, observe: false, input: DEFAULT_DIFF}),
    touch: ({file}) => runs.touch({file: relative(runtime.cwd, file)}),
    accept: async ({id}) => {
      const last = (await store.runs(id)).at(-1)
      if (last === undefined) throw toolError('no-target', {message: NO_RUN_MESSAGE})
      const record = await store.accept({id, run: last})
      history.reset(id)
      return record
    },
    status: ({session}) =>
      targetStatus({
        context: runtime,
        runner,
        session,
        unanswered: (id) => unanswered.has(id),
        rounds: history.rounds,
        latest: (id) => latestOf(latest.get(id)),
      }),
    watch: ({input: query, session}) =>
      watchReport({context: runtime, query, session, latest: (id) => latestOf(latest.get(id))}),
    xray: async ({id}) => {
      const design = await store.design(id)
      return {report: latest.get(id)?.report ?? null, outline: runtime.words.outline(design)}
    },
    dispose: edits.dispose,
  }
}

async function refreshSession(input: {store: Store; runs: Runs; session: SessionId}): Promise<void> {
  const {store, runs, session} = input
  const record = await store.current(session)
  if (record === null) return
  await runs.trigger({id: record.id, session, observe: false, input: DEFAULT_DIFF})
}

type Runs = ReturnType<typeof createRuns>

type History = ReturnType<typeof createHistory>

type Request = {
  job: RunJob
  touched: Touched
  runtime: DesignRuntime
  runner: Runner
  page: ServerToolPageAccess
  history: History
  latest: Map<string, Settled>
}

async function answeredDiff(request: Request & {unanswered: Set<string>}): Promise<DiffReport> {
  const {job, unanswered} = request
  const started = Date.now()
  try {
    const report = await runDiff(request)
    unanswered.delete(job.id)
    return report
  } catch (error) {
    if (!unansweredPage(error)) throw error
    unanswered.add(job.id)
    return unansweredRound({...request, error, started})
  }
}

async function runDiff(request: Request): Promise<DiffReport> {
  const {job, touched, runtime, runner, page, history, latest} = request
  const {store, measurer} = runtime
  const laps: Lap[] = [{phase: null, at: Date.now()}]
  const record = await store.record(job.id)
  if (record === null) throw toolError('no-target', {message: NO_TARGET_MESSAGE})
  const xray = runtime.xrayUrl({id: record.id, session: job.session})
  await measurer.connected(page)
  const route = await otherRoute({record, page, measurer})
  if (route !== null) return refused({record, route, xray})
  const decisions = await store.decisions(record.id)
  const css = await runner.css({id: record.id, decisions})
  laps.push({phase: null, at: Date.now()})
  const measuredPage = await measurer.measure({width: record.width, height: record.height, page})
  laps.push({phase: 'measure', at: Date.now()})
  if (measuredPage.pageError !== undefined) return pageErrorRound({...request, message: measuredPage.pageError})
  const reading = measuredPage.capture
  if (reading.framework === 'solid') await store.writePlaceholder({id: record.id, framework: reading.framework})
  laps.push({phase: 'decode', at: Date.now()})
  const capture = captureHash({raster: reading.raster, decisions})
  const rounds = history.rounds(record.id)
  const settled = latest.get(record.id)
  if (job.observe && touched === 'all' && settled !== undefined && countable({settled, capture})) {
    return countedRound({settled, job, rounds, runtime, page, record, history, latest})
  }
  const repeated = repeatedRound({rounds, capture, observe: job.observe, touched, timings: runner.timings(laps)})
  if (repeated !== null) return repeated
  const twins = await twinPlacements({store, id: record.id})
  const fresh = await runner.run({
    job,
    record,
    page,
    css,
    decisions,
    reply: measuredPage,
    capture,
    rounds,
    settled,
    twins,
    xray,
    laps,
  })
  if (fresh.round !== null) history.append({id: record.id, round: fresh.round})
  latest.set(record.id, fresh.settled)
  return fresh.report
}

function captureHash(input: {raster: Raster; decisions: Decision[]}): string {
  const counted = input.decisions.filter((decision) => decision.kind !== 'typography' && decision.kind !== 'twin')
  return createHash('sha256').update(input.raster.data).update(JSON.stringify(counted)).digest('hex')
}

async function knownSection(input: {
  runtime: DesignRuntime
  runner: Runner
  id: string
  query: DiffInput
}): Promise<DesignNode> {
  const css = await input.runner.css({id: input.id, decisions: await input.runtime.store.decisions(input.id)})
  const sections = css.design.root.children
  const found = sections.find((section) => section.id === input.query.section)
  if (found !== undefined) return found
  throw toolError('unknown-section', {
    message: `the design has no section ${input.query.section}; the sections are ${sections.map((section) => section.id).join(', ')}`,
  })
}

async function otherRoute(input: {
  record: TargetRecord
  page: ServerToolPageAccess
  measurer: Measurer
}): Promise<RouteItem | null> {
  const target = input.record.route
  if (target === undefined) return null
  const live = await input.measurer.route(input.page).catch(() => null)
  if (live === null) return null
  const compared = target.includes('?') ? live : (live.split('?')[0] ?? live)
  return compared === target ? null : {live, target}
}

async function countedRound(input: {
  settled: Settled
  job: RunJob
  rounds: Round[]
  runtime: DesignRuntime
  page: ServerToolPageAccess
  record: TargetRecord
  history: History
  latest: Map<string, Settled>
}): Promise<DiffReport> {
  const {settled, job, rounds, runtime, page, record, history, latest} = input
  const {judge} = runtime
  const {items, score, capturePath} = settled.judging
  const verdict = judge.verdict({...settled.judging, priors: rounds, round: rounds.length + 1})
  const {reported, listed} = judge.report({
    measured: settled.measured,
    input: job.input,
    twins: settled.twins,
  })
  const components = await runtime.provenance.attribute({
    ranked: reported,
    page,
    width: record.width,
    height: record.height,
    sourced: runtime.deltas.sourced,
  })
  const {paired, ...hinted} = settled.hinted
  const report: DiffReport = {
    ...omit(settled.report, ['hint']),
    ...verdict,
    components,
    ...judge.hint({...hinted, cut: {listed, shown: reported.length, paired}}),
  }
  const run = await runtime.store.writeRun({
    run: {...settled.run, round: rounds.length + 1, score: verdict.score, stop: verdict.stop},
    live: (await runtime.store.liveImage({id: record.id, run: settled.run.id})) ?? new Uint8Array(),
    diff: new Uint8Array(),
  })
  history.append({
    id: record.id,
    round: judge.round({items, score, capturePath, capture: settled.capture, report, section: job.input.section}),
  })
  latest.set(record.id, {...settled, observe: true, report, run})
  return report
}

function repeatedRound(input: {
  rounds: Round[]
  capture: string
  observe: boolean
  touched: Touched
  timings: ReturnType<Runner['timings']>
}): DiffReport | null {
  const previous = input.rounds.at(-1)
  if (!input.observe || input.touched !== 'all') return null
  if (previous === undefined || previous.capture !== input.capture) return null
  return {...previous.report, hint: UNCHANGED_HINT, timings: {...input.timings, carried: {pairs: 0, tiles: 0}}}
}

function countable(input: {settled: Settled; capture: string}): boolean {
  const {settled, capture} = input
  return !settled.observe && !settled.judging.partial && settled.capture === capture
}

function unansweredPage(error: unknown): error is Error {
  return isPageVerbError(error) && UNANSWERED_CODES.has(error.code)
}

async function unansweredRound(input: {
  error: Error
  job: RunJob
  history: History
  latest: Map<string, Settled>
  runtime: DesignRuntime
  started: number
}): Promise<DiffReport> {
  const previous = await previousReport(input)
  const elapsed = Date.now() - input.started
  return {
    ...previous,
    partial: true,
    stop: null,
    hint: `${UNANSWERED_HINT}; ${input.error.message}`,
    timings: TimingsSchema.parse({measure: elapsed, total: elapsed}),
  }
}

async function pageErrorRound(input: {
  message: string
  job: RunJob
  history: History
  latest: Map<string, Settled>
  runtime: DesignRuntime
}): Promise<DiffReport> {
  const {message} = input
  const previous = await previousReport(input)
  return {
    ...omit(previous, ['hint']),
    stop: null,
    changes: NO_CHANGES,
    warnings: [{kind: 'text', warning: 'page-error', live: message, target: ''}],
    brief: [`${PAGE_ERROR_BRIEF}: ${message}`],
  }
}

async function previousReport(input: {
  job: RunJob
  history: History
  latest: Map<string, Settled>
  runtime: DesignRuntime
}): Promise<DiffReport> {
  const {job, runtime} = input
  return (
    input.history.rounds(job.id).at(-1)?.report ??
    input.latest.get(job.id)?.report ??
    (await emptyReport({job, runtime}))
  )
}

async function emptyReport(input: {job: RunJob; runtime: DesignRuntime}): Promise<DiffReport> {
  const {job, runtime} = input
  const record = await runtime.store.record(job.id)
  if (record === null) throw toolError('no-target', {message: NO_TARGET_MESSAGE})
  return DiffReportSchema.parse({
    target: {id: record.id, ...(record.route === undefined ? {} : {route: record.route}), width: record.width},
    mismatch: 0,
    diffImage: '',
    livePath: '',
    xray: runtime.xrayUrl({id: record.id, session: job.session}).url,
    components: [],
    unmatched: [],
  })
}

function refused(input: {record: TargetRecord; route: RouteItem; xray: XrayLink}): DiffReport {
  const {record, route, xray} = input
  return DiffReportSchema.parse({
    target: {id: record.id, ...(record.route === undefined ? {} : {route: record.route}), width: record.width},
    mismatch: 0,
    diffImage: '',
    livePath: '',
    xray: xray.url,
    components: [],
    unmatched: [],
    warnings: [],
    sources: [],
    route,
    hint: `the tab shows ${route.live} but the design target is the design of ${route.target}; navigate the tab to ${route.target}, then diff again`,
  })
}

function createRuns(input: {execute: (input: {job: RunJob; touched: Touched}) => Promise<DiffReport>}): {
  trigger: (job: RunJob) => Promise<DiffReport>
  touch: (input: {file: string}) => void
} {
  const lanes = new Map<string, Lane>()
  const start = (lane: Lane): void => {
    const next = lane.pending
    if (next === null || lane.running) return
    lane.pending = null
    lane.running = true
    const touched: Touched = lane.touched.size === 0 ? 'all' : new Set(lane.touched)
    lane.touched.clear()
    input
      .execute({job: next.job, touched})
      .then(next.resolve, next.reject)
      .finally(() => {
        lane.running = false
        start(lane)
      })
  }
  return {
    touch: ({file}) => lanes.forEach((lane) => lane.touched.add(file)),
    trigger: (job) => {
      const lane = lanes.get(job.id) ?? {running: false, pending: null, touched: new Set<string>()}
      lanes.set(job.id, lane)
      const waiting = lane.pending
      if (waiting !== null) {
        waiting.job = {...job, observe: job.observe || waiting.job.observe}
        return waiting.promise
      }
      const deferred = Promise.withResolvers<DiffReport>()
      lane.pending = {job, ...deferred}
      start(lane)
      return deferred.promise
    },
  }
}

function createHistory(): {
  reset: (id: string) => void
  rounds: (id: string) => Round[]
  append: (input: {id: string; round: Round}) => void
} {
  const all = new Map<string, Round[]>()
  return {
    reset: (id) => all.set(id, []),
    rounds: (id) => all.get(id) ?? [],
    append: ({id, round}) => all.set(id, [...(all.get(id) ?? []), round]),
  }
}

type Deferred = {promise: Promise<DiffReport>; resolve: (report: DiffReport) => void; reject: (error: unknown) => void}

type Lane = {running: boolean; pending: (Deferred & {job: RunJob}) | null; touched: Set<string>}

const DEFAULT_DIFF: DiffInput = DiffInputSchema.parse({})

const UNCHANGED_HINT = 'the page has not changed since the last diff'

const PAGE_ERROR_BRIEF = 'the page did not render'

const UNANSWERED_CODES: ReadonlySet<string> = new Set(['page-hidden', 'no-live-widget'])

type RouteItem = NonNullable<DiffReport['route']>

function latestOf(settled: Settled | undefined): Latest | undefined {
  return settled === undefined ? undefined : {run: settled.run, report: settled.report, items: settled.judging.items}
}

const NO_RUN_MESSAGE = 'the design target has no run yet; run design_diff before accepting'

type Touched = Set<string> | 'all'

async function targetStatus(input: {
  context: DesignRuntime
  runner: Runner
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
  const css = await input.runner.css({id: record.id, decisions: await store.decisions(record.id)}).catch(() => null)
  const reregister = css === null
  const done = !reregister && (await finished({store, record, run, worse: judge.worse}))
  const sections =
    css === null ? [] : css.design.root.children.toSorted((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  const budgets = keyBy(judge.budgets({sections, items: [], rounds: input.rounds(record.id)}), (budget) => budget.id)
  const paths = input.runner.paths(record.id)
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

async function watchReport(input: {
  context: DesignRuntime
  query: WatchInput
  session: SessionId
  latest: (id: string) => Latest | undefined
}): Promise<WatchReport> {
  const {context, query, session, latest} = input
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
}

async function linkTwins(input: {store: Store; id: string; session: string}): Promise<void> {
  const {store, id, session} = input
  const others = (await store.list()).filter((record) => record.session === session && record.id !== id)
  const here = await latestRun({store, id})
  if (here === null) return
  await Promise.all(others.map((other) => linkPair({store, here, other: other.id})))
}

async function twinPlacements(input: {store: Store; id: string}): Promise<Twin[]> {
  const {store, id} = input
  const twins = (await store.decisions(id)).filter((decision) => decision.kind === 'twin')
  const placed = await Promise.all(
    twins.map(async (decision): Promise<(Twin & {confidence: number})[]> => {
      const [target = '', node = ''] = String(decision.value).split(TWIN_SEPARATOR)
      const run = await latestRun({store, id: target})
      const found = run === null ? null : find({root: run.root, id: node, idOf: pairedId(run.root)})
      if (found === null || found.live === null) return []
      return [{node: decision.anchor, target, path: found.live.path, confidence: found.confidence}]
    }),
  )
  return uniqBy(
    placed.flat().toSorted((a, b) => b.confidence - a.confidence),
    (twin) => `${twin.node}:${twin.target}`,
  ).map(({node, target, path}) => ({node, target, path}))
}

async function linkPair(input: {store: Store; here: Run; other: string}): Promise<void> {
  const {store, here, other} = input
  const there = await latestRun({store, id: other})
  if (there === null) return
  const links = [...walk({root: here.root})].flatMap(({node: match, depth}) => {
    const twin =
      depth === 0 || match.live === null
        ? null
        : find({root: there.root, id: match.live.path, idOf: livePath(there.root)})
    return twin === null ? [] : [{node: match.node.id, twin: twin.node.id}]
  })
  await unlink({store, id: here.design, other})
  await unlink({store, id: other, other: here.design})
  for (const link of links) {
    await store.decide({
      id: here.design,
      kind: 'twin',
      anchor: link.node,
      value: `${other}${TWIN_SEPARATOR}${link.twin}`,
    })
    await store.decide({
      id: other,
      kind: 'twin',
      anchor: link.twin,
      value: `${here.design}${TWIN_SEPARATOR}${link.node}`,
    })
  }
}

async function unlink(input: {store: Store; id: string; other: string}): Promise<void> {
  const {store, id, other} = input
  const stale = (await store.decisions(id)).filter(
    (decision) => decision.kind === 'twin' && String(decision.value).startsWith(`${other}${TWIN_SEPARATOR}`),
  )
  for (const decision of stale) await store.revoke({id, decision: decision.id})
}

async function latestRun(input: {store: Store; id: string}): Promise<Run | null> {
  const last = (await input.store.runs(input.id)).at(-1)
  return last === undefined ? null : input.store.run({id: input.id, run: last})
}

function pairedId(root: Match): (match: Match) => string {
  return (match) => (match === root ? '' : match.node.id)
}

function livePath(root: Match): (match: Match) => string {
  return (match) => (match === root || match.live === null ? '' : match.live.path)
}

function watchSettled(input: {
  bundler: BundlerBridge | undefined
  store: Store
  page: DesignPage
  refresh: (input: {session: SessionId}) => Promise<unknown>
  touch: (input: {file: string}) => void
}): {dispose: () => void; quiet: () => Promise<void>} {
  const {bundler, store, page, refresh, touch} = input
  const state: {burst: Burst | null; flight: Promise<void>} = {burst: null, flight: Promise.resolve()}
  const settle = async (since: number): Promise<void> => {
    const sessions = new Set((await store.list()).map((record) => record.session).filter(isSessionId))
    await Promise.all(
      [...sessions].map(async (session) => {
        const landed = await page
          .ask({sessionId: session, name: SETTLE_TOOL, input: {timeout: SETTLE_WAIT_MS, since}})
          .then(applied, () => false)
        if (landed) await refresh({session}).catch(() => undefined)
      }),
    )
  }
  const fire = (burst: Burst): void => {
    state.burst = null
    const files = [...burst.files]
    state.flight = state.flight
      .then(() => (outsidePage({bundler, files}) ? undefined : settle(burst.since)))
      .catch(() => undefined)
      .finally(() => burst.settled.resolve())
  }
  const unsubscribe = bundler?.subscribe?.((diagnostic) => {
    if (diagnostic.kind !== 'hmr-update') return
    touch({file: diagnostic.file})
    const burst = state.burst ?? {
      timer: undefined,
      since: diagnostic.timestamp - TOLERANCES.runDebounceMs,
      files: new Set<string>(),
      settled: Promise.withResolvers<void>(),
    }
    state.burst = burst
    burst.files.add(diagnostic.file)
    clearTimeout(burst.timer)
    burst.timer = setTimeout(() => fire(burst), TOLERANCES.settleQuiet)
  })
  return {
    dispose: () => {
      clearTimeout(state.burst?.timer)
      unsubscribe?.()
    },
    quiet: () =>
      Promise.race([
        state.burst?.settled.promise ?? state.flight,
        delay(TOLERANCES.settleQuiet + SETTLE_WAIT_MS, undefined, {ref: false}),
      ]),
  }
}

type Burst = {
  timer: ReturnType<typeof setTimeout> | undefined
  since: number
  files: Set<string>
  settled: PromiseWithResolvers<void>
}

function outsidePage(input: {bundler: BundlerBridge | undefined; files: string[]}): boolean {
  const {bundler, files} = input
  if (bundler === undefined) return false
  return files.every((file) => bundler.moduleGraph(file).length === 0)
}

function applied(reply: unknown): boolean {
  return typeof reply === 'object' && reply !== null && 'applied' in reply && reply.applied === true
}

const SETTLE_TOOL = 'page_hmr'

const SETTLE_WAIT_MS = 5000
