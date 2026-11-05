import {createHash} from 'node:crypto'
import {relative} from 'node:path'
import {omit} from 'es-toolkit'
import {isPageVerbError, toolError} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {SessionId} from '@conciv/protocol/chat-types'
import {
  DiffInputSchema,
  DiffReportSchema,
  NO_CHANGES,
  NO_TARGET_MESSAGE,
  TimingsSchema,
  UNANSWERED_HINT,
  type Clock,
  type Decision,
  type DesignPage,
  type DesignRuntime,
  type DesignSection,
  type DiffInput,
  type DiffReport,
  type Differ,
  type Latest,
  type Measurer,
  type Phase,
  type Raster,
  type Round,
  type RunJob,
  type Runner,
  type Settled,
  type TargetRecord,
  type XrayLink,
} from '../shared/defs.js'
import {createRunner} from './runner.js'

export function createDiffer(input: {runtime: DesignRuntime; page: DesignPage}): Differ {
  const {runtime, page} = input
  const {store} = runtime
  const history = createHistory()
  const tab = (session: SessionId): ServerToolPageAccess => ({
    call: (name, query) => page.ask({sessionId: session, name, input: query}),
  })
  const latest = new Map<string, Settled>()
  const unanswered = new Set<string>()
  const runner = createRunner({runtime})
  const runs = createRuns({
    execute: ({job, touched}) =>
      answeredDiff({job, touched, runtime, page: tab(job.session), history, latest, unanswered, runner}),
  })
  return {
    register: async ({input: target, session}) => {
      const previous = await store.current(session)
      const result = await runtime.registrar.register({input: target, session, page: tab(session)})
      if (previous?.id !== result.id || history.rounds(result.id).length === 0) history.reset(result.id)
      const first = await runs.trigger({id: result.id, session, observe: false, input: DEFAULT_DIFF}).catch(() => null)
      await runtime.twins.link({id: result.id, session})
      return first === null ? result : {...result, stage: first.stage, brief: first.brief}
    },
    run: async ({input: query, session}) => {
      const record = await runtime.registrar.current(session)
      const section = query.section === undefined ? null : await knownSection({runtime, id: record.id, query})
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
        counts: runtime.judge.counts({root: run?.root ?? null, nodes: section.nodes}),
      })
    },
    refresh: async ({session}) => {
      const record = await store.current(session)
      if (record === null) return
      await runs.trigger({id: record.id, session, observe: false, input: DEFAULT_DIFF})
    },
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
      runtime.projections.status({
        session,
        unanswered: (id) => unanswered.has(id),
        rounds: history.rounds,
        latest: (id) => latestOf(latest.get(id)),
      }),
    watch: ({input: query, session}) =>
      runtime.projections.watch({query, session, latest: (id) => latestOf(latest.get(id))}),
    xray: async ({id}) => {
      const design = await store.design(id)
      return {report: latest.get(id)?.report ?? null, outline: runtime.words.outline(design)}
    },
  }
}

type History = ReturnType<typeof createHistory>

type Request = {
  job: RunJob
  touched: Touched
  runtime: DesignRuntime
  page: ServerToolPageAccess
  history: History
  latest: Map<string, Settled>
  runner: Runner
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
  const {job, touched, runtime, page, history, latest, runner} = request
  const {store, measurer} = runtime
  const clock = startClock()
  const record = await store.record(job.id)
  if (record === null) throw toolError('no-target', {message: NO_TARGET_MESSAGE})
  const xray = runtime.xrayUrl({id: record.id, session: job.session})
  await measurer.connected(page)
  const route = await otherRoute({record, page, measurer})
  if (route !== null) return refused({record, route, xray})
  const decisions = await store.decisions(record.id)
  const css = await runtime.css.load({id: record.id, decisions})
  clock.skip()
  const measuredPage = await measurer.measure({width: record.width, height: record.height, page})
  clock.lap('measure')
  if (measuredPage.pageError !== undefined) return pageErrorRound({...request, message: measuredPage.pageError})
  const reading = measuredPage.capture
  if (reading.framework === 'solid') await store.writePlaceholder({id: record.id, framework: reading.framework})
  clock.lap('decode')
  const capture = captureHash({raster: reading.raster, decisions})
  const rounds = history.rounds(record.id)
  const settled = latest.get(record.id)
  if (job.observe && touched === 'all' && settled !== undefined && countable({settled, capture})) {
    return countedRound({settled, job, rounds, runtime, page, record, history, latest})
  }
  const repeated = repeatedRound({rounds, capture, observe: job.observe, touched, clock})
  if (repeated !== null) return repeated
  const fresh = await runner.fresh({
    job,
    record,
    page,
    css,
    decisions,
    measured: measuredPage,
    capture,
    rounds,
    settled,
    xray,
    clock,
  })
  if (fresh.round !== null) history.append({id: record.id, round: fresh.round})
  latest.set(record.id, fresh.settled)
  return fresh.report
}

function captureHash(input: {raster: Raster; decisions: Decision[]}): string {
  const counted = input.decisions.filter((decision) => decision.kind !== 'typography' && decision.kind !== 'twin')
  return createHash('sha256').update(input.raster.data).update(JSON.stringify(counted)).digest('hex')
}

async function knownSection(input: {runtime: DesignRuntime; id: string; query: DiffInput}): Promise<DesignSection> {
  const {runtime} = input
  const css = await runtime.css.load({id: input.id, decisions: await runtime.store.decisions(input.id)})
  const sections = runtime.css.sections(css.tree)
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
    placements: settled.placements,
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
  clock: Clock
}): DiffReport | null {
  const previous = input.rounds.at(-1)
  if (!input.observe || input.touched !== 'all') return null
  if (previous === undefined || previous.capture !== input.capture) return null
  return {...previous.report, hint: UNCHANGED_HINT, timings: {...input.clock.timings(), carried: {pairs: 0, tiles: 0}}}
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

function startClock(): Clock {
  const started = performance.now()
  const state = {mark: started}
  const spent = new Map<Phase, number>()
  const ms = (phase: Phase): number => Math.round(spent.get(phase) ?? 0)
  return {
    lap: (phase) => {
      const now = performance.now()
      spent.set(phase, (spent.get(phase) ?? 0) + now - state.mark)
      state.mark = now
    },
    skip: () => {
      state.mark = performance.now()
    },
    timings: () => ({
      capture: ms('capture'),
      decode: ms('decode'),
      measure: ms('measure'),
      mask: ms('mask'),
      similarity: ms('similarity'),
      regions: ms('regions'),
      pair: ms('pair'),
      typography: ms('typography'),
      deltas: ms('deltas'),
      judge: ms('judge'),
      encode: ms('encode'),
      write: ms('write'),
      total: Math.round(performance.now() - started),
    }),
  }
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
