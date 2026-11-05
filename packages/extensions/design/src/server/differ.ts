import {createHash, randomUUID} from 'node:crypto'
import {isAbsolute, relative} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {groupBy, keyBy, mapValues, maxBy, omit, uniqBy} from 'es-toolkit'
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
  type Box,
  type Css,
  type Decision,
  type Delta,
  type Design,
  type DesignNode,
  type DesignPage,
  type DesignRuntime,
  type DiffInput,
  type DiffReport,
  type Differ,
  type Item,
  type Judging,
  type Latest,
  type LiveCapture,
  type LiveComponent,
  type Match,
  type MatchText,
  type Measured,
  type Measurer,
  type Raster,
  type Round,
  type Run,
  type RunJob,
  type Settled,
  type StatusReport,
  type Store,
  type TargetRecord,
  type TextRun,
  type Twin,
  type Typography,
  type WatchInput,
  type WatchReport,
  type WatchRow,
  type XrayLink,
} from '../shared/defs.js'
import {aboveTolerance, designFamilies, TOLERANCES} from '../shared/tolerances.js'
import {find, walk} from '../shared/tree.js'
import {area, expand} from '../shared/box.js'
import {createRaster} from './raster.js'

export function createDiffer(input: {
  runtime: DesignRuntime
  page: DesignPage
  bundler: BundlerBridge | undefined
}): Differ {
  const {runtime, page, bundler} = input
  const {store} = runtime
  const history = createHistory()
  const tab = (session: SessionId): ServerToolPageAccess => ({
    call: (name, query) => page.ask({sessionId: session, name, input: query}),
  })
  const latest = new Map<string, Settled>()
  const unanswered = new Set<string>()
  const runs = createRuns({
    execute: ({job, touched}) =>
      answeredDiff({job, touched, runtime, page: tab(job.session), history, latest, unanswered}),
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
  const {job, touched, runtime, page, history, latest} = request
  const {store, measurer} = runtime
  const laps: Lap[] = [{phase: null, at: Date.now()}]
  const record = await store.record(job.id)
  if (record === null) throw toolError('no-target', {message: NO_TARGET_MESSAGE})
  const xray = runtime.xrayUrl({id: record.id, session: job.session})
  await measurer.connected(page)
  const route = await otherRoute({record, page, measurer})
  if (route !== null) return refused({record, route, xray})
  const decisions = await store.decisions(record.id)
  const css = await loadCss({store, id: record.id, decisions})
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
  const repeated = repeatedRound({rounds, capture, observe: job.observe, touched, laps})
  if (repeated !== null) return repeated
  const fresh = await freshRun({
    runtime,
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

async function knownSection(input: {runtime: DesignRuntime; id: string; query: DiffInput}): Promise<DesignNode> {
  const {runtime} = input
  const css = await loadCss({
    store: runtime.store,
    id: input.id,
    decisions: await runtime.store.decisions(input.id),
  })
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
  laps: Lap[]
}): DiffReport | null {
  const previous = input.rounds.at(-1)
  if (!input.observe || input.touched !== 'all') return null
  if (previous === undefined || previous.capture !== input.capture) return null
  return {...previous.report, hint: UNCHANGED_HINT, timings: {...timingsOf(input.laps), carried: {pairs: 0, tiles: 0}}}
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

type Phase = keyof Omit<DiffReport['timings'], 'total' | 'carried' | 'longestTask'>

type Lap = {phase: Phase | null; at: number}

function timingsOf(laps: Lap[]): Omit<DiffReport['timings'], 'carried' | 'longestTask'> {
  const ms = (phase: Phase): number =>
    laps.reduce((sum, lap, index) => {
      const before = laps[index - 1]
      return lap.phase === phase && before !== undefined ? sum + lap.at - before.at : sum
    }, 0)
  return {
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
    total: Date.now() - (laps[0]?.at ?? Date.now()),
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

const NO_BOX: Box = {x: 0, y: 0, w: 0, h: 0}

const NO_RUN_MESSAGE = 'the design target has no run yet; run design_diff before accepting'

type Touched = Set<string> | 'all'

async function freshRun(input: {
  runtime: DesignRuntime
  job: RunJob
  record: TargetRecord
  page: ServerToolPageAccess
  css: Css
  decisions: Decision[]
  measured: Awaited<ReturnType<Measurer['measure']>>
  capture: string
  rounds: Round[]
  settled: Settled | undefined
  xray: XrayLink
  laps: Lap[]
}): Promise<{report: DiffReport; settled: Settled; round: Round | null}> {
  const {
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
    laps,
    runtime,
  } = input
  const {store, measurer, judge, deltas} = runtime
  const reading = measuredPage.capture
  const base = await baseRun({store, id: record.id})
  const live = {
    ...reading,
    raster: measurer.paintOver({onto: reading.raster, from: css.raster, boxes: [...reading.masks, ...css.dropped]}),
  }
  laps.push({phase: 'capture', at: Date.now()})
  const stamp = {source: live.source, confidence: measurer.confidence(live), width: record.width}
  const {grid, rawTiles, reuse} = measurer.reuse({before: settled ?? null, live: live.raster, target: css.raster})
  const texts = measurer.texts({
    components: live.components,
    runs: textRuns(css.design.root),
    live: live.raster,
    target: css.raster,
    reuse,
  })
  const slots = [...walk({root: css.design.root})].flatMap(({node}) => (node.kind === 'image' ? [node.box] : []))
  const masked = measurer.paintOver({
    onto: live.raster,
    from: css.raster,
    boxes: [...texts.agreeing.map((box) => expand({box, by: TOLERANCES.glyphHalo + TOLERANCES.blurRadius})), ...slots],
  })
  const compared = measurer.compare({live: masked, target: css.raster, previous: settled?.tiles ?? null})
  laps.push({phase: 'mask', at: Date.now()})
  const scored = measurer.similarity({
    live: masked,
    target: css.raster,
    mask: runtime.geometry.mask({
      boxes: [...reading.masks, ...css.dropped, ...slots],
      area: {x: 0, y: 0, w: compared.width, h: compared.height},
    }),
    differing: compared.mask,
    width: compared.width,
    height: compared.height,
  })
  const similarity = rounded(measurer.mean({tiles: scored}))
  const sectionSimilarity = Object.fromEntries(
    css.design.root.children.map((section) => [
      section.id,
      rounded(measurer.mean({tiles: scored, within: roundedBox(section.box)})),
    ]),
  )
  laps.push({phase: 'similarity', at: Date.now()})
  const twins = await twinPlacements({store, id: record.id})
  const pageRoot = pageComponent(live)
  laps.push({phase: null, at: Date.now()})
  const paired = await runtime.pairer({
    design: css.design,
    live: pageRoot,
    decisions,
    previous: base?.root ?? null,
    rasters: {live: live.raster, target: css.raster},
    twins: twins.map(({node, path}) => ({node, path})),
    comparators: runtime.comparators,
    budget: TOLERANCES.pairBudgetMs,
  })
  laps.push({phase: 'pair', at: Date.now()})
  const exact = css.design.source.kind !== 'image'
  const sole = soleTexts({root: paired.root, exact})
  const typography = await measurer.typography({texts: textOwners(sole), raster: css.raster, page})
  await Promise.all(
    Object.entries(typography.estimates)
      .filter(([node]) => !decisions.some((decision) => decision.kind === 'typography' && decision.anchor === node))
      .map(([node, value]) => store.decide({id: record.id, kind: 'typography', anchor: node, value})),
  )
  const root = typed({match: sole, estimates: typography.estimates})
  laps.push({phase: 'typography', at: Date.now()})
  const elements = deltas.elements({
    root,
    live: pageRoot,
    raster: live.raster,
    exact,
    source: live.source,
    mismatchAt: (box) => measurer.share({...compared, box: expand({box, by: TOLERANCES.tileMargin})}),
  })
  const alignment = runtime.geometry.align({root, live: live.raster, exact})
  const page0 = {x: 0, y: 0, w: live.viewport.width, h: live.viewport.height}
  const found = await deltas.measure({
    elements,
    reuse,
    shift: alignment.global,
    live: live.raster,
    target: css.raster,
    page: page0,
    decisions,
    stamp,
  })
  const unmatched = judge.unmatched({
    root,
    components: live.components,
    offsets: alignment.offsets,
    measured: found.measured,
  })
  const {reported, listed} = judge.report({measured: found.measured, input: job.input, twins})
  const components = await runtime.provenance.attribute({
    ranked: reported,
    page,
    width: record.width,
    height: record.height,
    sourced: deltas.sourced,
  })
  const enriched = new Map(
    reported.map((entry, index) => [entry.element, components[index]?.deltas ?? entry.report.deltas]),
  )
  const measured = found.measured.map((entry) => ({
    element: entry.element,
    deltas: enriched.get(entry.element) ?? entry.deltas,
  }))
  const items = judge.items({components: measured, unmatched, root})
  const warnings = (await deltas.warnings({elements, judged: found.judged, components: live.components, root})).map(
    (delta) => ({...delta, ...stamp}),
  )
  const painted = judge.painted(live.components)
  const score = judge.score({items, unmatched, measured, masks: css.dropped, page: page0})
  laps.push({phase: 'deltas', at: Date.now()})
  const advances = job.observe && !paired.partial
  const id = runId()
  const round = advances ? rounds.length + 1 : rounds.length
  const crop = (node: string): string => cropUrl({xray: xray.url, node, run: id})
  const accepted = new Set(
    decisions.filter((decision) => decision.kind === 'accept-node').map((decision) => decision.anchor),
  )
  const settledTree = judge.settle({
    previous: base?.root ?? null,
    root: withDeltas({match: root, measured}),
    accepted,
    run: id,
    items,
    crop,
  })
  const changed = {
    changes: paired.partial ? NO_CHANGES : settledTree.changes,
    since: paired.partial || base === null ? null : base.round,
  }
  const earlierSimilarity = settled?.report.similarity
  const judging: Judging = {
    items,
    score,
    capturePath: live.capturePath,
    capture,
    warnings,
    painted,
    partial: paired.partial,
    changed,
    crop,
    similarity: earlierSimilarity === undefined ? null : {now: similarity, was: earlierSimilarity},
  }
  const verdict = judge.verdict({...judging, priors: advances ? rounds : rounds.slice(0, -1), round})
  laps.push({phase: 'judge', at: Date.now()})
  const pageWidth = Math.min(live.raster.width, css.raster.width)
  const images = {
    live: live.raster.png(),
    diff: measurer.paintDiff({live: masked, mask: compared.mask, width: pageWidth}).png(),
  }
  laps.push({phase: 'encode', at: Date.now()})
  const run = await store.writeRun({
    run: {
      id,
      round,
      design: record.id,
      root: settledTree.root,
      extras: extrasOf({components: live.components, root}),
      score: verdict.score,
      stop: verdict.stop,
      images: {live: '', diff: ''},
    },
    live: images.live,
    diff: images.diff,
  })
  laps.push({phase: 'write', at: Date.now()})
  const hinted = {attributed: live.components.length > 0, absolute: xray.absolute, partial: paired.partial}
  const pairedCount = [...walk({root})].filter(({node, depth}) => depth > 0 && node.live !== null).length
  const report = DiffReportSchema.parse({
    ...verdict,
    timings: {
      ...timingsOf(laps),
      carried: {pairs: paired.carried, tiles: compared.carried},
      ...(measuredPage.longestTask === undefined ? {} : {longestTask: measuredPage.longestTask}),
    },
    target: {id: record.id, ...(record.route === undefined ? {} : {route: record.route}), width: record.width},
    xray: xray.url,
    diffImage: reportPath({cwd: runtime.cwd, path: run.images.diff}),
    livePath: reportPath({cwd: runtime.cwd, path: run.images.live}),
    mismatch: rounded(compared.mismatch),
    similarity,
    sectionSimilarity,
    components,
    unmatched,
    warnings: [...warnings, ...typographyWarnings({...typography, stamp})],
    painted,
    segmentation: segmentationQuality(css.design),
    capturePath: live.capturePath,
    sources: measurer.sources(live),
    responsive: await responsiveTwins({store, id: record.id, design: css.design}),
    partial: paired.partial,
    paired: pairedCount,
    changes: changed.changes,
    ledger: judge.counts(run.root.children),
    ...targetPaths({context: runtime, id: record.id}),
    pinsLost: pinsLost({decisions, root}),
    ...(live.limits === undefined ? {} : {limits: live.limits}),
    ...judge.hint({...hinted, cut: {listed, shown: reported.length, paired: pairedCount}}),
  })
  return {
    report,
    round: advances
      ? judge.round({items, score, capturePath: live.capturePath, capture, report, section: job.input.section})
      : null,
    settled: {
      capture,
      observe: job.observe,
      run,
      report,
      judging,
      measured,
      twins,
      hinted: {...hinted, paired: pairedCount},
      grid,
      rawTiles,
      tiles: compared.tiles,
      textMasks: texts.masks,
      measures: found.measures,
    },
  }
}

async function baseRun(input: {store: Store; id: string}): Promise<Run | null> {
  const all = await Promise.all((await input.store.runs(input.id)).map((run) => input.store.run({id: input.id, run})))
  const stored = all.filter((run) => run !== null)
  const top = Math.max(0, ...stored.map((run) => run.round))
  if (top === 0) return null
  return stored.find((run) => run.round === top) ?? null
}

function textRuns(root: DesignNode): TextRun[] {
  return [...walk({root})].flatMap(({node}) => (node.kind === 'text' ? [{box: node.box, text: node.text}] : []))
}

function roundedBox(box: Box): Box {
  return {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h)}
}

function pageComponent(capture: LiveCapture): LiveComponent {
  return {
    source: null,
    key: null,
    instance: null,
    owner: null,
    tag: 'body',
    text: '',
    box: {x: 0, y: 0, w: capture.viewport.width, h: capture.viewport.height},
    textBox: null,
    glyphs: [],
    axis: null,
    columns: null,
    styles: {
      background: '',
      color: '',
      fontSize: 0,
      lineHeight: 0,
      fontWeight: 0,
      fontFamily: '',
      textAlign: '',
      radius: 0,
      position: 'static',
      sizing: {width: 'fixed', height: 'fixed'},
      border: {width: 0, style: 'none', color: '', side: 'top'},
      gradient: null,
    },
    role: null,
    hints: [],
    index: 0,
    path: '',
    drawn: false,
    placeholder: null,
    children: capture.components,
  }
}

function soleTexts(input: {root: Match; exact: boolean}): Match {
  if (!input.exact) return input.root
  const texts = [...walk({root: input.root})].flatMap(({node}) =>
    node.node.kind === 'text' && node.live !== null ? [{match: node, path: node.live.path, live: node.live}] : [],
  )
  const kept = new Set(
    Object.values(groupBy(texts, (entry) => entry.path)).flatMap((entries) => {
      const best = maxBy(entries, (entry) => area(intersection({a: entry.match.node.box, b: entry.live.box}) ?? NO_BOX))
      return best === undefined ? [] : [best.match]
    }),
  )
  const dropped = new Set(texts.filter((entry) => !kept.has(entry.match)).map((entry) => entry.match))
  return unpaired({match: input.root, dropped})
}

function unpaired(input: {match: Match; dropped: Set<Match>}): Match {
  const children = input.match.children.map((child) => unpaired({...input, match: child}))
  if (!input.dropped.has(input.match)) return {...input.match, children}
  return {...input.match, live: null, confidence: 0, children}
}

function textOwners(root: Match): {node: MatchText; owner: LiveComponent}[] {
  return [...walk({root})].flatMap(({node}) =>
    node.node.kind === 'text' && node.live !== null ? [{node: node.node, owner: {...node.live, children: []}}] : [],
  )
}

function typed(input: {match: Match; estimates: Record<string, Typography>}): Match {
  const {match, estimates} = input
  const children = match.children.map((child) => typed({match: child, estimates}))
  const found = estimates[match.node.id]
  if (match.node.kind !== 'text' || found === undefined) return {...match, children}
  return {...match, node: {...match.node, typography: found}, children}
}

function withDeltas(input: {match: Match; measured: Measured[]}): Match {
  const owned = new Map(input.measured.map((entry) => [entry.element.match, entry.deltas]))
  const apply = (match: Match): Match => ({
    ...match,
    deltas: owned.get(match) ?? [],
    children: match.children.map(apply),
  })
  return apply(input.match)
}

function extrasOf(input: {components: LiveComponent[]; root: Match}): LiveComponent[] {
  const paths = [...walk({root: input.root})].flatMap(({node}) => (node.live === null ? [] : [node.live.path]))
  const claimed = (component: LiveComponent): boolean =>
    paths.some((path) => path === component.path || path.startsWith(`${component.path}/`))
  const unclaimed = (components: LiveComponent[]): LiveComponent[] =>
    components.flatMap((component) => {
      if (!claimed(component)) return [{...component, children: []}]
      return unclaimed(component.children)
    })
  return unclaimed(input.components)
}

function runId(): string {
  return `${Date.now()}-${randomUUID().slice(0, 4)}`
}

function pinsLost(input: {decisions: Decision[]; root: Match}): string[] {
  const paired = new Map(
    [...walk({root: input.root})].flatMap(({node}) =>
      node.live === null ? [] : [[node.node.id, node.live.path] as const],
    ),
  )
  return input.decisions
    .filter((decision) => decision.kind === 'pin' && paired.get(decision.anchor) !== decision.value)
    .map((decision) => decision.id)
}

function typographyWarnings(input: {
  estimates: Record<string, unknown>
  skipped: number
  stamp: Pick<Delta, 'source' | 'confidence' | 'width'>
}): Delta[] {
  if (input.skipped === 0) return []
  return [
    {
      kind: 'fontSize',
      live: input.skipped,
      target: input.skipped + Object.keys(input.estimates).length,
      warning: 'typography-skipped',
      ...input.stamp,
    },
  ]
}

function cropUrl(input: {xray: string; node: string; run: string}): string {
  const {xray, node, run} = input
  return `${xray.replace(XRAY_LIST, XRAY_NODE)}&node=${encodeURIComponent(node)}&run=${encodeURIComponent(run)}`
}

function segmentationQuality(design: Design): 'full' | 'partial' {
  const page = design.viewport.width * design.viewport.height
  const covered = [...walk({root: design.root})]
    .filter(({node, parent}) => node.kind === 'image' && parent !== null && regionLike({parent, root: design.root}))
    .reduce((sum, {node}) => sum + node.box.w * node.box.h, 0)
  return page > 0 && covered / page > TOLERANCES.segmentImageShare ? 'partial' : 'full'
}

function regionLike(input: {parent: DesignNode; root: DesignNode}): boolean {
  return input.parent === input.root || (input.parent.kind === 'box' && input.parent.paint === undefined)
}

function rounded(mismatch: number): number {
  return Math.round(mismatch * MISMATCH_PRECISION) / MISMATCH_PRECISION
}

const XRAY_LIST = '/xray/list?'

const XRAY_NODE = '/xray/node?'

const MISMATCH_PRECISION = 10_000

async function loadCss(input: {store: Store; id: string; decisions: Decision[]}): Promise<Css> {
  const {store, id, decisions} = input
  const design = await store.design(id)
  const png = await store.targetImage(id)
  if (png === null) throw toolError('no-target', {message: NO_TARGET_MESSAGE})
  const decoded = createRaster(png)
  const raster = design.scale === 1 ? decoded : decoded.scaled(design.scale)
  const by = 1 / design.scale
  const page = scaledBox({box: design.root.box, by})
  const excluded = new Set(
    decisions
      .filter((decision) => decision.kind === 'excluded' || decision.kind === 'image-slot')
      .map((decision) => decision.anchor),
  )
  const typography = new Map(
    decisions.flatMap((decision) =>
      decision.kind === 'typography' && typeof decision.value === 'object' && decision.value !== null
        ? [[decision.anchor, decision.value] as const]
        : [],
    ),
  )
  const dropped: Box[] = []
  const convert = (node: DesignNode): DesignNode | null => {
    const scaled = scaledNode({node, by, typography: typography.get(node.id)})
    if (excluded.has(node.id) || outside({box: scaled.box, page})) {
      dropped.push(...[...walk({root: scaled})].map((visit) => visit.node.box))
      return null
    }
    return {...pagedNode({node: scaled, page}), children: node.children.flatMap((child) => convert(child) ?? [])}
  }
  const root = {
    ...scaledNode({node: design.root, by, typography: undefined}),
    children: design.root.children.flatMap((child) => convert(child) ?? []),
  }
  const css = {...design, scale: 1, viewport: {width: page.w, height: page.h}, root}
  return {design: css, raster, dropped}
}

function scaledNode(input: {node: DesignNode; by: number; typography: Typography | undefined}): DesignNode {
  const {node, by} = input
  const box = scaledBox({box: node.box, by})
  const layout = node.layout === undefined ? undefined : scaledLayout({layout: node.layout, by})
  const base = {...node, box, ...(layout === undefined ? {} : {layout})}
  if (base.kind === 'box') return {...base, radius: base.radius * by}
  if (base.kind !== 'text') return base
  const found = base.typography?.confidence === 1 ? base.typography : (input.typography ?? base.typography)
  return {
    ...base,
    lines: base.lines.map((line) => ({...line, box: scaledBox({box: line.box, by})})),
    ...(found === undefined
      ? {}
      : {
          typography:
            found === input.typography ? found : {...found, size: found.size * by, lineHeight: found.lineHeight * by},
        }),
  }
}

function scaledLayout(input: {
  layout: NonNullable<DesignNode['layout']>
  by: number
}): NonNullable<DesignNode['layout']> {
  const {layout, by} = input
  return {
    ...layout,
    ...(layout.gap === undefined ? {} : {gap: {...layout.gap, px: layout.gap.px * by}}),
    ...(layout.padding === undefined ? {} : {padding: mapValues(layout.padding, (value) => value * by)}),
  }
}

function scaledBox(input: {box: Box; by: number}): Box {
  const {box, by} = input
  return {x: box.x * by, y: box.y * by, w: box.w * by, h: box.h * by}
}

function outside(input: {box: Box; page: Box}): boolean {
  const {box, page} = input
  return box.x >= page.x + page.w || box.x + box.w <= page.x || box.y >= page.y + page.h || box.y + box.h <= page.y
}

function pagedNode(input: {node: DesignNode; page: Box}): DesignNode {
  const {node, page} = input
  const box = intersection({a: node.box, b: page})
  if (box === null) return node
  const {layout} = node
  const padding = layout?.padding
  if (layout === undefined || padding === undefined) return {...node, box}
  const clipped = {
    left: box.x - node.box.x,
    right: node.box.x + node.box.w - (box.x + box.w),
    top: box.y - node.box.y,
    bottom: node.box.y + node.box.h - (box.y + box.h),
  }
  const inset = {
    left: Math.max(0, padding.left - clipped.left),
    right: Math.max(0, padding.right - clipped.right),
    top: Math.max(0, padding.top - clipped.top),
    bottom: Math.max(0, padding.bottom - clipped.bottom),
  }
  return {...node, box, layout: {...layout, padding: inset}}
}

async function targetStatus(input: {
  context: DesignRuntime
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
  const css = await loadCss({store, id: record.id, decisions: await store.decisions(record.id)}).catch(() => null)
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

function targetPaths(input: {context: DesignRuntime; id: string}): {designPath: string; placeholderPath: string} {
  const {context, id} = input
  const path = (key: string): string => reportPath({cwd: context.cwd, path: context.store.path(key) ?? key})
  return {designPath: path(`${id}:design.txt`), placeholderPath: path(`${id}:placeholder.tsx`)}
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

async function responsiveTwins(input: {store: Store; id: string; design: Design}): Promise<DiffReport['responsive']> {
  const {store, id, design} = input
  const twins = (await store.decisions(id)).filter((decision) => decision.kind === 'twin')
  const byTarget = Map.groupBy(twins, (decision) => String(decision.value).split(TWIN_SEPARATOR)[0] ?? '')
  const sections = await Promise.all(
    [...byTarget].map(async ([target, decisions]) => {
      const record = await store.record(target)
      const there = await store.design(target).catch(() => null)
      if (record === null || there === null) return []
      const twinned = new Map(
        decisions.map((decision) => [decision.anchor, String(decision.value).split(TWIN_SEPARATOR)[1] ?? '']),
      )
      return [
        compareSlices({
          here: design,
          hereWidth: design.viewport.width,
          there: there.root,
          thereWidth: there.viewport.width / there.scale,
          scale: there.scale,
          twinned,
          width: record.width,
          target,
        }),
      ]
    }),
  )
  return sections.flat()
}

const TWIN_SEPARATOR = ':'

const STRETCHED = 0.85

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

function compareSlices(input: {
  here: Design
  hereWidth: number
  there: DesignNode
  thereWidth: number
  scale: number
  twinned: Map<string, string>
  width: number
  target: string
}): DiffReport['responsive'][number] {
  const {here, there, twinned, width, target} = input
  const hereNodes = nodesOf(here.root)
  const twinIds = new Set(twinned.values())
  const hereRanks = ranks(hereNodes.filter((node) => twinned.has(node.id)))
  const thereRanks = ranks(nodesOf(there).filter((node) => twinIds.has(node.id)))
  const linked = hereNodes.flatMap((node) => {
    const twin = find({
      root: there,
      id: twinned.get(node.id) ?? '',
      idOf: (other: DesignNode) => (other === there ? '' : other.id),
    })
    return twin === null || twin === there ? [] : [{node, twin}]
  })
  return {
    target,
    width,
    twins: linked.length,
    absent: hereNodes.filter((node) => node.kind !== 'image' && !twinned.has(node.id)).map(nodeLabel),
    reordered: linked
      .filter(({node, twin}) => hereRanks.get(node.id) !== thereRanks.get(twin.id))
      .map(({node}) => nodeLabel(node)),
    stretched: linked
      .filter(
        ({node, twin}) =>
          spans({box: node.box, width: input.hereWidth}) !==
          spans({box: {...twin.box, w: twin.box.w / input.scale}, width: input.thereWidth}),
      )
      .map(({node}) => nodeLabel(node)),
  }
}

function nodesOf(root: DesignNode): DesignNode[] {
  return [...walk({root})].flatMap(({node, depth}) => (depth === 0 ? [] : [node]))
}

function ranks(nodes: DesignNode[]): Map<string, number> {
  return new Map(nodes.toSorted((a, b) => readingOrder(a.box, b.box)).map((node, index) => [node.id, index]))
}

function readingOrder(a: Box, b: Box): number {
  const shared = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return shared >= Math.min(a.h, b.h) / 2 ? a.x - b.x : a.y - b.y
}

function spans(input: {box: DesignNode['box']; width: number}): boolean {
  return input.box.w >= STRETCHED * input.width
}

function nodeLabel(node: DesignNode): string {
  if (node.kind === 'text') return node.text
  return `${node.kind} ${Math.round(node.box.w)}×${Math.round(node.box.h)} at ${Math.round(node.box.x)},${Math.round(node.box.y)}`
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

function intersection(input: {a: Box; b: Box}): Box | null {
  const {a, b} = input
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const w = Math.min(a.x + a.w, b.x + b.w) - x
  const h = Math.min(a.y + a.h, b.y + b.h) - y
  return w > 0 && h > 0 ? {x, y, w, h} : null
}
