import pixelmatch from 'pixelmatch'
import {diff} from '@blazediff/core'
import {z} from 'zod'
import {AsyncRetryer} from '@tanstack/pacer/async-retryer'
import {groupBy, keyBy, mapValues, maxBy, omit, partition, pick, range, uniq, uniqBy} from 'es-toolkit'
import {isPageVerbError, toolError, type AnyToolBuilder} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {createHash} from 'node:crypto'
import {basename, relative} from 'node:path'
import type {SessionId} from '@conciv/protocol/chat-types'
import {PAGE_PING_TOOL} from '@conciv/protocol/page-types'
import {
  BLIND_FIELDS,
  BoxSchema,
  captureDef,
  clearDef,
  DESIGN_GUIDE,
  diffDef,
  DiffInputSchema,
  DiffReportSchema,
  GlyphSchema,
  OpinionSchema,
  LiveStylesSchema,
  measureDef,
  MeasureResultSchema,
  NO_CHANGES,
  NO_RUN_MESSAGE,
  NO_TARGET_MESSAGE,
  SourceLocSchema,
  statusDef,
  targetDef,
  watchDef,
  winnerDef,
  WinnerResultSchema,
  TimingsSchema,
  type CaptureInput,
  type CaptureResult,
  type ClearInput,
  type ClearResult,
  type CompactReport,
  type ComponentReport,
  type DiffInput,
  type DiffReport,
  type Ledger,
  type Stage,
  type Stop,
  type StatusReport,
  type WatchInput,
  type WatchRow,
  type WinnerInput,
  type WinnerResult,
} from '../shared/defs.js'
import {aboveTolerance, CONFUSABLES, designFamilies, iconSized, kindStage, TOLERANCES} from '../shared/tolerances.js'
import type {
  Box,
  ColorMetric,
  CssMap,
  Decision,
  Delta,
  DeltaKind,
  DesignContext,
  DesignPage,
  DesignRuntime,
  DesignSection,
  Framework,
  Differ,
  LiveCapture,
  LiveComponent,
  LiveRole,
  Matched,
  MeasureSource,
  Pair,
  PairRecord,
  PixelComparator,
  Raster,
  TileCache,
  TileRecord,
  Touched,
  Role,
  ServerStep,
  Side,
  StoredRun,
  TargetModel,
  TargetNode,
  TargetRecord,
  TargetStore,
  TextGroup,
  TextNode,
  TextRun,
  TwinPair,
  TwinVote,
  Unmatched,
  XrayLink,
} from '../shared/types.js'
import {PLACEHOLDER_KINDS} from '../shared/types.js'
import {edgeStrip, glyphCoreColor, isOpaqueHex, opinionSide, sideFrom} from './deltas.js'
import {
  changeReport,
  createHistory,
  createRuns,
  deltaSize,
  enclosed,
  heldBy,
  itemsFrom,
  judge,
  lexicallyWorse,
  roundRecord,
  scoreTuple,
  sectionBudgets,
  type Round,
  type RunJob,
} from './loop.js'
import {align, fingerprint, glyphRun, pairTree, pairTwins, type Offset, type Shift} from './pair.js'
import {ledgerCounts, ledgerPairs, nextLedger, watchRows} from './ledger.js'
import {newStamp} from './store.js'
import {lookups, mapDeclaration, readLiveText, type LiveText} from './provenance.js'
import {
  boxBlur,
  boxMask,
  copyMask,
  crop,
  decodePng,
  diffMask,
  downscale,
  edgeMap,
  encodePng,
  expand,
  findRegions,
  maskCount,
  maskShare,
  meanSimilarity,
  medianColor,
  overlapping,
  packMask,
  paintOver,
  sameLine,
  similarityTiles,
  tileBox,
  tileGrid,
  tileHashes,
  trimToInk,
  union,
  unpackMask,
  type Grid,
} from './raster.js'
import {estimateTypography, liveRoute, pathnameIn, registerTarget, segmentationQuality} from './target.js'
import {placement, type Tree} from './layout.js'

export function createDiffer(input: {runtime: DesignRuntime; store: TargetStore; page: DesignPage}): Differ {
  const {store, page} = input
  const design = {...input.runtime, store}
  const history = createHistory()
  const tab = (session: SessionId): ServerToolPageAccess => ({
    call: (name, query) => page.ask({sessionId: session, name, input: query}),
  })
  const settledRuns = new Map<string, Settled>()
  const unanswered = new Set<string>()
  const runs = createRuns({
    execute: ({job, touched}) =>
      answeredDiff({job, touched, design, page: tab(job.session), history, latest: settledRuns, unanswered}),
  })
  return {
    register: async ({input: target, session}) => {
      const previous = await store.current({session})
      const result = await registerTarget({input: target, session, design, page: tab(session)})
      const fresh = previous?.id !== result.id || history.rounds(result.id).length === 0
      if (fresh) history.reset(result.id)
      await linkTwins({store, id: result.id, session})
      const first = await runs.trigger({id: result.id, session, observe: false, input: DEFAULT_DIFF}).catch(() => null)
      return first === null ? result : {...result, stage: first.stage, brief: first.brief}
    },
    run: async ({input: query, session}) => {
      const record = await currentTarget({design, session})
      const section = query.section === undefined ? null : await knownSection({store, id: record.id, query})
      const report = await runs.trigger({id: record.id, session, observe: true, input: query})
      if (section === null) return report
      const settled = settledRuns.get(record.id)
      const ledger = settled?.ledger ?? (await store.ledger(record.id))
      return sectionReport({report, section, settled, ledger, rounds: history.rounds(record.id)})
    },
    refresh: async ({session}) => {
      const record = await store.current({session})
      if (record === null) return
      await runs.trigger({id: record.id, session, observe: false, input: DEFAULT_DIFF})
    },
    capture: ({id, session}) => runs.trigger({id, session, observe: false, input: DEFAULT_DIFF}),
    touch: ({file}) => runs.touch({file: relative(design.cwd, file)}),
    accept: async ({id}) => {
      const latest = await store.latestRun(id)
      if (latest === null) throw toolError('no-target', {message: NO_RUN_MESSAGE})
      const record = await store.accept({id, run: latest.run})
      history.reset(id)
      return record
    },
    status: ({session}) => targetStatus({store, session, unanswered, history}),
    watch: async ({input: query, session}) => {
      const record = await currentTarget({design, session})
      const settled = settledRuns.get(record.id)
      const stored = await store.ledger(record.id)
      const ledger = settled?.ledger ?? stored
      const live = settled?.ledger !== undefined && settled.ledger !== null && settled.run !== stored?.run
      const {nodes} = await store.model(record.id)
      const rows = watchRows({nodes, ledger}).filter((row) => watchMatches({row, query}))
      return {
        target: record.id,
        run: ledger?.run ?? null,
        live,
        counts: ledger === null ? {...ledgerCounts(null), unbuilt: nodes.length} : ledgerCounts(ledger),
        rows: rows.slice(0, query.limit),
        truncated: Math.max(0, rows.length - query.limit),
      }
    },
  }
}

export const SERVER_STEPS = [
  targetDef.server((input, ctx: DesignContext, request) => ctx.differ.register({input, session: request.sessionId})),
  diffDef.server(async (input, ctx: DesignContext, request) => {
    const report = await ctx.differ.run({input, session: request.sessionId})
    const design = input.full === true ? await ctx.design.store.design(report.target.id) : null
    const compact = shaped({report, design, limit: input.limit})
    return ctx.design.blind ? omit(compact, BLIND_FIELDS) : compact
  }),
  statusDef.server((_input, ctx: DesignContext, request) => ctx.differ.status({session: request.sessionId})),
  watchDef.server((input, ctx: DesignContext, request) => ctx.differ.watch({input, session: request.sessionId})),
  captureDef.server(captureStep),
  winnerDef.server(winnerStep),
  clearDef.server(clearStep),
] as const satisfies readonly AnyToolBuilder[]

export const PIXEL_COMPARATORS = {
  blazediff: {name: 'blazediff', compare: blazediffCompare},
  pixelmatch: {name: 'pixelmatch', compare: pixelmatchCompare},
} as const satisfies Record<string, PixelComparator>

export function groupText(input: {
  components: LiveComponent[]
  runs: TextRun[]
  live: Raster
  target: Raster
  color: ColorMetric
}): {groups: TextGroup[]; agreeing: Box[]} {
  const {components, runs, live, target, color} = input
  if (runs.length === 0) return {groups: [], agreeing: []}
  const liveItems = flattened(components).flatMap((owner) =>
    owner.glyphs.map((glyph): TextItem => ({side: 'live', text: glyph.text, boxes: glyph.boxes, owner})),
  )
  const targetItems = runs.map((run): TextItem => ({side: 'target', text: run.text, boxes: [run.box], owner: null}))
  const grouped = connected([...liveItems, ...targetItems]).flatMap(
    (members) => toGroup({members, live, target, color}) ?? [],
  )
  return {groups: grouped.map(({group}) => group), agreeing: grouped.flatMap(({mask}) => mask)}
}

function agreeingText(input: {
  components: LiveComponent[]
  runs: TextRun[]
  live: Raster
  target: Raster
  color: ColorMetric
  reuse: Reuse | null
}): {agreeing: Box[]; masks: Map<string, Box[]>} {
  const {components, runs, live, target, color, reuse} = input
  if (runs.length === 0) return {agreeing: [], masks: new Map()}
  const liveItems = flattened(components).flatMap((owner) =>
    owner.glyphs.map((glyph): TextItem => ({side: 'live', text: glyph.text, boxes: glyph.boxes, owner})),
  )
  const targetItems = runs.map((run): TextItem => ({side: 'target', text: run.text, boxes: [run.box], owner: null}))
  const masks = connected([...liveItems, ...targetItems]).map((members): [string, Box[]] => {
    const key = JSON.stringify(members.map((member) => [member.side, member.text, member.boxes]))
    const kept = reuse?.textMasks.get(key)
    const region = expand({box: union(members.flatMap((member) => member.boxes)), by: TOLERANCES.tileSide})
    if (kept !== undefined && reuse !== null && reuse.unchanged(region)) return [key, kept]
    return [key, toGroup({members, live, target, color})?.mask ?? []]
  })
  return {agreeing: masks.flatMap(([, mask]) => mask), masks: new Map(masks)}
}

const DEFAULT_DIFF: DiffInput = DiffInputSchema.parse({})
const UNBUILT_SECTION_BRIEF = 'nothing of this section is built yet'
const STRETCHED = 0.85
const GEOMETRY_KINDS: Delta['kind'][] = [
  'inset-left',
  'inset-right',
  'inset-top',
  'inset-bottom',
  'gap-before',
  'gap-after',
  'padding',
  'align',
]

type History = ReturnType<typeof createHistory>
type Measured = {pair: Pair; deltas: Delta[]}
type Reported = {pair: Pair; report: ComponentReport}
type Judging = Omit<Parameters<typeof judge>[0], 'priors' | 'round'>
type Settled = {
  grid: Grid
  rawTiles: string[]
  textMasks: Map<string, Box[]>
  measures: Map<string, Delta[]>
  capture: string
  observe: boolean
  run: string
  report: DiffReport
  judging: Judging
  measured: Measured[]
  placements: Placement[]
  hinted: Omit<Parameters<typeof reportHint>[0], 'cut'> & {paired: number}
  ledger: Ledger | null
}

async function answeredDiff(request: Parameters<typeof runDiff>[0] & {unanswered: Set<string>}): Promise<DiffReport> {
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

async function runDiff(request: {
  job: RunJob
  touched: Touched
  design: DesignRuntime
  page: ServerToolPageAccess
  history: History
  latest: Map<string, Settled>
}): Promise<DiffReport> {
  const {job, touched, design, page, history, latest} = request
  const clock = startClock()
  const record = await design.store.find({id: job.id})
  if (record === null) throw toolError('no-target', {message: NO_TARGET_MESSAGE})
  const xray = design.xrayUrl({id: record.id, session: job.session})
  await widgetConnected(page)
  const route = await otherRoute({record, page})
  if (route !== null) return refused({record, route, xray})
  const decisions = await design.store.decisions(record.id)
  const loaded = cssModel(await design.store.model(record.id))
  const dropped = droppedNodes({decisions, nodes: loaded.nodes, page: loaded.root.box})
  const model = pageModel(loaded)
  clock.skip()
  const reply = await askMeasure({width: record.width, height: record.height, page})
  clock.lap('measure')
  if (reply.pageError !== undefined) return pageErrorRound({...request, message: reply.pageError})
  const reading = liveCapture(reply)
  await matchPlaceholder({store: design.store, id: record.id, framework: reading.framework})
  clock.lap('decode')
  const capture = createHash('sha256').update(reading.raster.data).update(JSON.stringify(decisions)).digest('hex')
  const rounds = history.rounds(record.id)
  const settled = latest.get(record.id)
  if (job.observe && touched === 'all' && settled !== undefined && countable({settled, capture})) {
    return countedRound({settled, job, rounds, design, page, record, history, latest})
  }
  const repeated = repeatedRound({rounds, capture, observe: job.observe, touched, clock})
  if (repeated !== null) return repeated
  const previous = await design.store.latestRun(record.id)
  const tiles = previous === null ? null : await design.store.tiles({id: record.id, run: previous.run})
  const droppedBoxes = model.nodes.filter((node) => dropped.has(node.id)).map((node) => node.box)
  const live = {
    ...reading,
    raster: paintOver({onto: reading.raster, from: model.raster, boxes: [...reading.masks, ...droppedBoxes]}),
  }
  clock.lap('capture')
  const color = design.comparators.color
  const stamp = {source: live.source, confidence: sourceConfidence(live), width: record.width}
  const {grid, rawTiles, reuse} = reuseFrom({settled, previous, live: live.raster, target: model.raster})
  const texts = agreeingText({
    components: live.components,
    runs: targetRuns(model),
    live: live.raster,
    target: model.raster,
    color,
    reuse,
  })
  const agreeing = texts.agreeing
  const slots = model.nodes.filter((node) => node.kind === 'image').map((node) => node.box)
  const masked = paintOver({
    onto: live.raster,
    from: model.raster,
    boxes: [...agreeing.map((box) => expand({box, by: TOLERANCES.glyphHalo + TOLERANCES.blurRadius})), ...slots],
  })
  const pixels = comparePages({
    live: masked,
    target: model.raster,
    comparator: design.comparators.pixel,
    previous: tiles,
    clock,
  })
  const scoredTiles = similarityTiles({
    live: masked,
    target: model.raster,
    mask: boxMask({
      boxes: [...reading.masks, ...droppedBoxes, ...slots],
      area: {x: 0, y: 0, w: pixels.width, h: pixels.height},
    }),
    differing: pixels.mask,
    width: pixels.width,
    height: pixels.height,
  })
  const similarity = rounded(meanSimilarity(scoredTiles))
  clock.lap('similarity')
  const nodes = model.nodes.filter((node) => !dropped.has(node.id))
  const pins = pinsFrom(decisions)
  const placements = await twinPlacements({store: design.store, id: record.id})
  const earlier = await design.store.ledger(record.id)
  const sections = await design.store.sections(record.id)
  const sectionSimilarity = mapValues(
    keyBy(sections, (section) => section.id),
    (section) => rounded(meanSimilarity(scoredTiles.filter((tile) => centred({inner: tile.box, outer: section.box})))),
  )
  clock.skip()
  const paired = design.pairer({
    components: live.components,
    nodes,
    twinVotes: twinVotes(placements),
    pins,
    carried: carriedPairs({earlier, previous}),
    touched,
    tolerances: TOLERANCES,
    live: live.raster,
    target: model.raster,
    deadline: Date.now() + TOLERANCES.pairBudgetMs,
  })
  clock.lap('pair')
  const exact = model.source.kind !== 'image'
  const sole = soleTexts({matched: paired.matched, exact})
  const typography = await estimateTypography({
    texts: sole.flatMap((entry) => (entry.node.kind === 'text' ? [{node: entry.node, owner: entry.component}] : [])),
    target: model,
    id: record.id,
    store: design.store,
    page,
    color,
  })
  clock.lap('typography')
  const matched = sole.map((entry) => withTypography({entry, typography: typography.estimates}))
  const pairs = pairTree({
    matched,
    components: live.components,
    exact,
    live: live.raster,
    source: live.source,
    mismatchAt: (box) => maskShare({...pixels, box: expand({box, by: TOLERANCES.tileMargin})}),
  })
  const alignment = align({pairs, live: live.raster, exact, tolerances: TOLERANCES})
  const judged = await textJudgements({pairs, cwd: design.cwd})
  const page0 = {x: 0, y: 0, w: live.viewport.width, h: live.viewport.height}
  const measures = cachedMeasures({
    pairs,
    nodes,
    reuse,
    shift: alignment.global,
    live: live.raster,
    target: model.raster,
    page: page0,
    design,
  })
  const measured = pairs.map((pair): Measured => ({
    pair,
    deltas: decided({
      deltas: slotDeltas({
        pair,
        deltas: pixelRow({pair, deltas: [...(measures.get(pair)?.deltas ?? []), ...textDeltas({pair, judged})]}),
      }).map((delta) => ({
        ...delta,
        ...stamp,
      })),
      pair,
      decisions,
      color,
    }),
  }))
  const pairedNodes = new Set(matched.map((entry) => entry.node.id))
  const tree = {root: model.root, nodes}
  const unmatched = [
    ...unbuiltEntries({tree, pairedNodes}),
    ...extraEntries({
      components: live.components,
      paired: new Set(matched.map((entry) => entry.component.path)),
      cards: matched.map((entry) => entry.node.box),
    }),
    ...offsetEntries({offsets: alignment.offsets, measured}),
  ]
  const {reported, listed} = reportedComponents({measured, input: job.input, color, placements})
  const components = await withProvenance({ranked: reported, design, page, width: record.width, height: record.height})
  const enriched = new Map(
    reported.map((entry, index) => [entry.pair, components[index]?.deltas ?? entry.report.deltas]),
  )
  const items = itemsFrom({
    components: measured.map((entry) => ({pair: entry.pair, deltas: enriched.get(entry.pair) ?? entry.deltas})),
    unmatched,
    color,
    tree,
  })
  const warnings = [
    ...drawnWarnings({pairs, components: live.components, nodes}),
    ...(await warningDeltas({pairs, judged, components: live.components, cwd: design.cwd})),
  ].map((delta) => ({...delta, ...stamp}))
  const painted = paintedPage(live.components)
  const score = scoreTuple({
    items,
    unpairedShare: unpairedShare({unmatched, page: page0}),
    residualShare: residualShare({measured, unmatched, masks: droppedBoxes, page: page0}),
  })
  clock.lap('deltas')
  const advances = job.observe && !paired.partial
  const run = newStamp()
  const round = advances ? rounds.length + 1 : rounds.length
  const nodeCrop = (node: string): string => cropUrl({xray: xray.url, node, run})
  const {changed, counts, ledger} = ledgerStep({
    earlier,
    partial: paired.partial,
    facts: {run, round, nodes, matched, items, decisions},
    components: live.components,
    tree,
    crop: nodeCrop,
  })
  const judging: Judging = {
    items,
    score,
    capturePath: live.capturePath,
    capture,
    ranker: design.ranker,
    warnings,
    painted,
    color,
    partial: paired.partial,
    changed,
    crop: nodeCrop,
    similarity: previous?.report.similarity === undefined ? null : {now: similarity, was: previous.report.similarity},
  }
  const verdict = judge({
    ...judging,
    priors: advances ? rounds : rounds.slice(0, -1),
    round,
  })
  clock.lap('judge')
  const pageWidth = Math.min(live.raster.width, model.raster.width)
  const images = {
    live: encodePng(live.raster),
    diff: encodePng(paintDiff({live: masked, mask: pixels.mask, width: pageWidth})),
  }
  clock.lap('encode')
  const timings = {
    ...clock.timings(),
    carried: {pairs: paired.carried, tiles: pixels.carried},
    ...(reply.longestTask === undefined ? {} : {longestTask: reply.longestTask}),
  }
  const hinted = {attributed: live.components.length > 0, absolute: xray.absolute, partial: paired.partial}
  if (advances && ledger !== null) await design.store.writeLedger({id: record.id, ledger})
  const report = await design.store.writeRun({
    id: record.id,
    run,
    images,
    pairs: matched.map((entry) => ({
      node: entry.node.id,
      path: entry.component.path,
      confidence: entry.confidence,
      fingerprint: fingerprint(entry.component),
    })),
    tiles: pixels.tiles,
    result: {
      ...verdict,
      timings,
      target: {id: record.id, ...(record.route === undefined ? {} : {route: record.route}), width: record.width},
      xray: xray.url,
      mismatch: rounded(pixels.mismatch),
      similarity,
      sectionSimilarity,
      components,
      unmatched,
      warnings: [...warnings, ...typographyWarnings({...typography, stamp})],
      painted,
      segmentation: segmentationQuality(model),
      capturePath: live.capturePath,
      sources: measuredSources(live),
      responsive: await responsiveSection({store: design.store, id: record.id, model}),
      partial: paired.partial,
      paired: matched.length,
      changes: changed.changes,
      ledger: counts,
      designPath: design.store.designPath(record.id),
      placeholderPath: design.store.placeholderPath(record.id),
      pinsLost: pins
        .filter((pin) => !matched.some((entry) => entry.node.id === pin.node && entry.component.path === pin.path))
        .map((pin) => pin.decision),
      ...(live.limits === undefined ? {} : {limits: live.limits}),
      ...reportHint({...hinted, cut: {listed, shown: reported.length, paired: matched.length}}),
    },
  })
  if (advances) {
    history.append({
      id: record.id,
      round: roundRecord({items, score, capturePath: live.capturePath, capture, report, section: job.input.section}),
    })
  }
  latest.set(record.id, {
    capture,
    observe: job.observe,
    run: runName(report),
    report,
    judging,
    measured,
    placements,
    hinted: {...hinted, paired: matched.length},
    grid,
    rawTiles,
    textMasks: texts.masks,
    measures: new Map([...measures.values()].map((entry) => [entry.key, entry.deltas])),
    ledger,
  })
  return report
}

function unansweredPage(error: unknown): error is Error {
  return isPageVerbError(error) && UNANSWERED_CODES.has(error.code)
}

async function unansweredRound(input: {
  error: Error
  job: RunJob
  history: History
  latest: Map<string, Settled>
  design: DesignRuntime
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
  design: DesignRuntime
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
  design: DesignRuntime
}): Promise<DiffReport> {
  const {job, design} = input
  return (
    input.history.rounds(job.id).at(-1)?.report ??
    input.latest.get(job.id)?.report ??
    (await design.store.lastResult(job.id)) ??
    (await emptyReport({job, design}))
  )
}

async function widgetConnected(page: ServerToolPageAccess): Promise<void> {
  const retryer = new AsyncRetryer(() => pingWidget(page), {
    backoff: 'fixed',
    baseWait: TOLERANCES.widgetPoll,
    maxAttempts: Math.ceil(TOLERANCES.widgetWait / TOLERANCES.widgetPoll) + 1,
    throwOnError: false,
  })
  await retryer.execute()
}

async function pingWidget(page: ServerToolPageAccess): Promise<void> {
  await page.call(PAGE_PING_TOOL, {}).catch((error: unknown) => {
    if (isPageVerbError(error) && error.code === 'no-widget') throw error
  })
}

async function emptyReport(input: {job: RunJob; design: DesignRuntime}): Promise<DiffReport> {
  const {job, design} = input
  const record = await design.store.find({id: job.id})
  if (record === null) throw toolError('no-target', {message: NO_TARGET_MESSAGE})
  return DiffReportSchema.parse({
    target: {id: record.id, ...(record.route === undefined ? {} : {route: record.route}), width: record.width},
    mismatch: 0,
    diffImage: '',
    livePath: '',
    xray: design.xrayUrl({id: record.id, session: job.session}).url,
    components: [],
    unmatched: [],
  })
}

function cachedMeasures(input: {
  pairs: Pair[]
  nodes: TargetNode[]
  reuse: Reuse | null
  shift: Shift
  live: Raster
  target: Raster
  page: Box
  design: DesignRuntime
}): Map<Pair, {key: string; deltas: Delta[]}> {
  const {pairs, nodes, reuse, shift, live, target, page, design} = input
  return new Map(
    pairs.map((pair): [Pair, {key: string; deltas: Delta[]}] => {
      const key = measureKey({pair, pairs, nodes, shift})
      const kept = reuse?.measures.get(key)
      const region = expand({
        box: union([pair.liveBox, moved({box: pair.liveBox, shift})]),
        by: TOLERANCES.tileSide,
      })
      if (kept !== undefined && reuse !== null && reuse.unchanged(region)) return [pair, {key, deltas: kept}]
      const deltas = measureDeltas({
        pair,
        pairs,
        nodes,
        live,
        target,
        page,
        design,
        shift,
      })
      return [pair, {key, deltas}]
    }),
  )
}

type Reuse = {textMasks: Map<string, Box[]>; measures: Map<string, Delta[]>; unchanged: (box: Box) => boolean}

function reuseFrom(input: {settled: Settled | undefined; previous: StoredRun | null; live: Raster; target: Raster}): {
  grid: Grid
  rawTiles: string[]
  reuse: Reuse | null
} {
  const {settled, previous, live, target} = input
  const width = Math.min(live.width, target.width)
  const height = Math.min(live.height, target.height)
  const grid = tileGrid({width, height, side: TOLERANCES.tileSide})
  const rawTiles = tileHashes({raster: live, grid, margin: COMPARE_REACH})
  if (settled === undefined || previous === null || settled.run !== previous.run) return {grid, rawTiles, reuse: null}
  if (!sameGrid({a: settled.grid, b: grid})) return {grid, rawTiles, reuse: null}
  const changed = new Set(rawTiles.flatMap((hash, index) => (settled.rawTiles[index] === hash ? [] : [index])))
  const reuse = {
    textMasks: settled.textMasks,
    measures: settled.measures,
    unchanged: (box: Box) => tilesUnder({grid, box}).every((index) => !changed.has(index)),
  }
  return {grid, rawTiles, reuse}
}

function tilesUnder(input: {grid: Grid; box: Box}): number[] {
  const {grid, box} = input
  const left = Math.max(0, Math.floor(box.x / grid.side))
  const right = Math.min(grid.columns - 1, Math.floor((box.x + box.w) / grid.side))
  const top = Math.max(0, Math.floor(box.y / grid.side))
  const bottom = Math.min(grid.rows - 1, Math.floor((box.y + box.h) / grid.side))
  return range(top, bottom + 1).flatMap((row) => range(left, right + 1).map((column) => row * grid.columns + column))
}

function measureKey(input: {pair: Pair; pairs: Pair[]; nodes: TargetNode[]; shift: Shift}): string {
  const {pair, pairs, nodes, shift} = input
  const boxes = (other: Pair | null): Box[] | null => (other === null ? null : [other.liveBox, other.targetBox])
  return JSON.stringify({
    node: pair.node,
    live: omit(pair.live, ['children']),
    texts: pair.texts.map((node) => node.box),
    boxes: boxes(pair),
    parent: boxes(pair.parent),
    prev: boxes(pair.prev),
    next: boxes(pair.next),
    under: pairs.filter((other) => under({pair: other, ancestor: pair})).map(boxes),
    designed: nodes.filter((node) => node.within === pair.node.id).length,
    shift,
  })
}

type Phase = keyof Omit<DiffReport['timings'], 'total' | 'carried' | 'longestTask'>
type Clock = {
  lap: (phase: Phase) => void
  skip: () => void
  timings: () => Omit<DiffReport['timings'], 'carried' | 'longestTask'>
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

function countable(input: {settled: Settled; capture: string}): boolean {
  const {settled, capture} = input
  return !settled.observe && !settled.judging.partial && settled.capture === capture
}

async function countedRound(input: {
  settled: Settled
  job: RunJob
  rounds: Round[]
  design: DesignRuntime
  page: ServerToolPageAccess
  record: TargetRecord
  history: History
  latest: Map<string, Settled>
}): Promise<DiffReport> {
  const {settled, job, rounds, design, page, record, history, latest} = input
  const {items, score, capturePath} = settled.judging
  const verdict = judge({...settled.judging, priors: rounds, round: rounds.length + 1})
  const {reported, listed} = reportedComponents({
    measured: settled.measured,
    input: job.input,
    color: design.comparators.color,
    placements: settled.placements,
  })
  const components = await withProvenance({ranked: reported, design, page, width: record.width, height: record.height})
  const {paired, ...hinted} = settled.hinted
  const report: DiffReport = {
    ...omit(settled.report, ['hint']),
    ...verdict,
    components,
    ...reportHint({...hinted, cut: {listed, shown: reported.length, paired}}),
  }
  await design.store.amend({id: record.id, run: settled.run, report})
  if (settled.ledger !== null) {
    await design.store.writeLedger({id: record.id, ledger: {...settled.ledger, round: rounds.length + 1}})
  }
  history.append({
    id: record.id,
    round: roundRecord({items, score, capturePath, capture: settled.capture, report, section: job.input.section}),
  })
  latest.set(record.id, {...settled, observe: true, report})
  return report
}

function ledgerStep(input: {
  earlier: Ledger | null
  partial: boolean
  facts: Omit<Parameters<typeof nextLedger>[0], 'earlier' | 'components'>
  components: LiveComponent[]
  tree: Tree
  crop: (node: string) => string
}): {
  changed: Judging['changed']
  counts: DiffReport['ledger']
  ledger: Ledger | null
} {
  const {earlier, tree} = input
  if (input.partial) {
    return {changed: {changes: NO_CHANGES, since: null}, counts: ledgerCounts(earlier), ledger: null}
  }
  const next = nextLedger({...input.facts, earlier, components: input.components})
  return {
    changed: {changes: changeReport({...next, tree, crop: input.crop}), since: earlier?.round ?? null},
    counts: ledgerCounts(next.ledger),
    ledger: next.ledger,
  }
}

async function knownSection(input: {store: TargetStore; id: string; query: DiffInput}): Promise<DesignSection> {
  const sections = await input.store.sections(input.id)
  const found = sections.find((section) => section.id === input.query.section)
  if (found !== undefined) return found
  throw toolError('unknown-section', {
    message: `the design has no section ${input.query.section}; the sections are ${sections.map((section) => section.id).join(', ')}`,
  })
}

function sectionReport(input: {
  report: DiffReport
  section: DesignSection
  settled: Settled | undefined
  ledger: Ledger | null
  rounds: Round[]
}): DiffReport {
  const {report, section, settled} = input
  const nodes = new Set(section.nodes)
  const inside = (box: Box | undefined): boolean => box !== undefined && enclosed({inner: box, outer: section.box})
  const held = (item: {node?: string | undefined; box?: Box | undefined}): boolean => heldBy({item, section, nodes})
  const unmatched = report.unmatched.filter((entry) => held({node: entry.node, box: entry.target ?? entry.live}))
  const changes = mapValues(report.changes, (list) => list.filter((change) => nodes.has(change.node)))
  const scoped: DiffReport = {
    ...omit(report, ['similarity']),
    components: report.components.filter(
      (component) => (component.nodes ?? []).some((node) => nodes.has(node)) || inside(component.live),
    ),
    unmatched,
    warnings: report.warnings.filter((warning) => inside(warning.box)),
    changes,
    ledger: subtreeCounts({ledger: input.ledger, nodes: section.nodes}),
    section: {id: section.id, line: section.line},
    scope: 'section',
    page: {
      stop: report.stop,
      stage: report.stage,
      score: report.score,
      ...(report.similarity === undefined ? {} : {similarity: report.similarity}),
    },
    ...withSimilarity(report.sectionSimilarity[section.id]),
  }
  if (settled === undefined) return scoped
  const items = settled.judging.items.filter(held)
  const measured = settled.measured.filter((entry) => nodes.has(entry.pair.node.id))
  const verdict = judge({
    ...settled.judging,
    items,
    score: scoreTuple({
      items,
      unpairedShare: unpairedShare({unmatched, page: section.box}),
      residualShare: residualShare({measured, unmatched, masks: [], page: section.box}),
    }),
    warnings: settled.judging.warnings.filter((warning) => inside(warning.box)),
    changed: {...settled.judging.changed, changes},
    priors: [],
    round: report.round,
    similarity: null,
  })
  const unbuilt = measured.length === 0
  const open = unbuilt || settled.judging.partial || items.some((item) => item.stage !== null)
  const brief = unbuilt ? [UNBUILT_SECTION_BRIEF, ...verdict.brief] : verdict.brief
  const [budget] = sectionBudgets({sections: [section], items, rounds: input.rounds})
  return {
    ...scoped,
    ...verdict,
    brief,
    stop: sectionStop({open, spent: budget?.spent ?? false}),
    paired: measured.length,
  }
}

function sectionStop(input: {open: boolean; spent: boolean}): Stop | null {
  if (!input.open) return 'done'
  return input.spent ? 'budget' : null
}

function subtreeCounts(input: {ledger: Ledger | null; nodes: string[]}): DiffReport['ledger'] {
  const {ledger} = input
  return ledgerCounts(ledger === null ? null : {...ledger, nodes: pick(ledger.nodes, input.nodes)})
}

function carriedPairs(input: {earlier: Ledger | null; previous: StoredRun | null}): PairRecord[] {
  const ledger = ledgerPairs(input.earlier)
  const held = keyBy(ledger, (record) => record.node)
  const previous = (input.previous?.pairs ?? []).map((record) => held[record.node] ?? record)
  return uniqBy([...previous, ...ledger], (record) => record.node)
}

function cropUrl(input: {xray: string; node: string; run: string}): string {
  const {xray, node, run} = input
  return `${xray.replace(XRAY_LIST, XRAY_NODE)}&node=${encodeURIComponent(node)}&run=${encodeURIComponent(run)}`
}

function runName(report: DiffReport): string {
  return basename(report.livePath).slice(LIVE_PREFIX.length, -PNG_SUFFIX.length)
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

function cssModel(model: TargetModel): TargetModel {
  if (model.scale === 1) return model
  const by = 1 / model.scale
  return {
    ...model,
    raster: downscale({raster: model.raster, scale: model.scale}),
    nodes: model.nodes.map((node) => scaledNode({node, by})),
  }
}

function scaledNode(input: {node: TargetNode; by: number}): TargetNode {
  const {node, by} = input
  const box = scaledBox({box: node.box, by})
  if (node.kind === 'box') return {...node, box, radius: node.radius * by}
  if (node.kind !== 'text') return {...node, box}
  return {...node, box, lines: node.lines.map((line) => ({...line, box: scaledBox({box: line.box, by})}))}
}

function scaledBox(input: {box: Box; by: number}): Box {
  const {box, by} = input
  return {x: box.x * by, y: box.y * by, w: box.w * by, h: box.h * by}
}

function pageModel(model: TargetModel): TargetModel {
  const page = model.root.box
  return {...model, nodes: model.nodes.map((node) => pagedNode({node, page}))}
}

function pagedNode(input: {node: TargetNode; page: Box}): TargetNode {
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
  const inset = mapValues(padding, (value, edge) => Math.max(0, value - clipped[edge]))
  return {...node, box, layout: {...layout, padding: inset}}
}

function droppedNodes(input: {decisions: Decision[]; nodes: TargetNode[]; page: Box}): Set<string> {
  const {page} = input
  const anchors = new Set([
    ...input.decisions
      .filter((entry) => entry.kind === 'excluded' || entry.kind === 'image-slot')
      .map((entry) => entry.anchor),
    ...input.nodes.filter((node) => outside({box: node.box, page})).map((node) => node.id),
  ])
  const parents = new Map(input.nodes.map((node) => [node.id, node.within]))
  return new Set(input.nodes.filter((node) => withinDropped({id: node.id, anchors, parents})).map((node) => node.id))
}

function outside(input: {box: Box; page: Box}): boolean {
  const {box, page} = input
  return box.x >= page.x + page.w || box.x + box.w <= page.x || box.y >= page.y + page.h || box.y + box.h <= page.y
}

function withinDropped(input: {
  id: string | undefined
  anchors: Set<string>
  parents: Map<string, string | undefined>
}): boolean {
  if (input.id === undefined) return false
  if (input.anchors.has(input.id)) return true
  return withinDropped({...input, id: input.parents.get(input.id)})
}

function pinsFrom(decisions: Decision[]): {node: string; path: string; decision: string}[] {
  return decisions
    .filter((entry) => entry.kind === 'pin')
    .map((entry) => ({
      node: entry.anchor,
      path: typeof entry.value === 'string' ? entry.value : '',
      decision: entry.id,
    }))
}

function comparePages(input: {
  live: Raster
  target: Raster
  comparator: PixelComparator
  previous: TileCache | null
  clock: Clock
}): {
  mismatch: number
  mask: Uint8Array
  width: number
  height: number
  tiles: TileCache
  carried: number
} {
  const {live, target, comparator, previous, clock} = input
  const width = Math.min(live.width, target.width)
  const height = Math.min(live.height, target.height)
  const grid = tileGrid({width, height, side: TOLERANCES.tileSide})
  const hashes = tileHashes({raster: live, grid, margin: COMPARE_REACH})
  const reusable = previous !== null && sameGrid({a: previous, b: grid}) ? previous.tiles : []
  const boxes = hashes.map((_, index) => tileBox({grid, index}))
  const changed = hashes.flatMap((hash, index) => (reusable[index]?.hash === hash ? [] : [index]))
  const mask = new Uint8Array(width * height)
  reusable.forEach((tile, index) => {
    const box = boxes[index]
    if (box === undefined || tile.hash !== hashes[index] || tile.mask === undefined) return
    unpackMask({packed: tile.mask, mask, width, box})
  })
  compareAreas({
    clusters: clusters({grid, changed}).map((cluster) => cluster.flatMap((index) => boxes[index] ?? [])),
    width,
    height,
  }).forEach((area) => compareTiles({live, target, comparator, mask, width, clock, ...area}))
  const tiles = hashes.map((hash, index): TileRecord => {
    const kept = reusable[index]
    if (kept !== undefined && kept.hash === hash) return kept
    const box = boxes[index] ?? {x: 0, y: 0, w: 0, h: 0}
    const count = maskCount({mask, width, box})
    return count === 0
      ? {hash, mismatch: 0}
      : {hash, mismatch: count / (box.w * box.h), mask: packMask({mask, width, box})}
  })
  const total = width * height
  const differing = tiles.reduce((sum, tile, index) => sum + Math.round(tile.mismatch * tileArea(boxes[index])), 0)
  const mismatch = total === 0 ? 0 : differing / total
  clock.lap('mask')
  return {
    mismatch,
    mask,
    width,
    height,
    tiles: {side: grid.side, columns: grid.columns, rows: grid.rows, width, height, tiles},
    carried: hashes.length - changed.length,
  }
}

function clusters(input: {grid: Grid; changed: number[]}): number[][] {
  const {grid, changed} = input
  const wanted = new Set(changed)
  const cells = Uint8Array.from(range(grid.columns * grid.rows), (index) => (wanted.has(index) ? 1 : 0))
  return findRegions({mask: cells, width: grid.columns, height: grid.rows, minSize: 1}).map((region) =>
    changed.filter((index) => {
      const column = index % grid.columns
      const row = (index - column) / grid.columns
      return column >= region.x && column < region.x + region.w && row >= region.y && row < region.y + region.h
    }),
  )
}

function tileArea(box: Box | undefined): number {
  return box === undefined ? 0 : box.w * box.h
}

function sameGrid(input: {a: Pick<Grid, 'side' | 'width' | 'height'>; b: Grid}): boolean {
  const {a, b} = input
  return a.side === b.side && a.width === b.width && a.height === b.height
}

type CompareArea = {area: Box; boxes: Box[]}

function compareAreas(input: {clusters: Box[][]; width: number; height: number}): CompareArea[] {
  const {width, height} = input
  return input.clusters
    .filter((boxes) => boxes.length > 0)
    .map((boxes): CompareArea => {
      const reach = expand({box: union(boxes), by: TOLERANCES.tileSide})
      const x = Math.max(0, reach.x)
      const y = Math.max(0, reach.y)
      return {
        area: {x, y, w: Math.min(width, reach.x + reach.w) - x, h: Math.min(height, reach.y + reach.h) - y},
        boxes,
      }
    })
    .reduce((kept: CompareArea[], next) => absorbed({kept, next}), [])
}

function absorbed(input: {kept: CompareArea[]; next: CompareArea}): CompareArea[] {
  const {kept, next} = input
  const [touching, apart] = partition(kept, (other) => intersection({a: other.area, b: next.area}) !== null)
  if (touching.length === 0) return [...kept, next]
  return absorbed({
    kept: apart,
    next: {
      area: union([next.area, ...touching.map((other) => other.area)]),
      boxes: [...next.boxes, ...touching.flatMap((other) => other.boxes)],
    },
  })
}

function compareTiles(input: {
  live: Raster
  target: Raster
  comparator: PixelComparator
  mask: Uint8Array
  width: number
  area: Box
  boxes: Box[]
  clock: Clock
}): void {
  const {live, target, comparator, mask, width, area, boxes, clock} = input
  const a = boxBlur({raster: crop({raster: live, box: area}).raster, radius: TOLERANCES.blurRadius})
  const b = boxBlur({raster: crop({raster: target, box: area}).raster, radius: TOLERANCES.blurRadius})
  const compared = comparator.compare({a, b})
  clock.lap('mask')
  boxes.forEach((box) => copyMask({from: compared.mask, fromArea: area, onto: mask, width, box}))
}

type Placement = TwinVote & {target: string}

async function twinPlacements(input: {store: TargetStore; id: string}): Promise<Placement[]> {
  const {store, id} = input
  const twins = await store.twins(id)
  const placed = await Promise.all(
    Object.entries(twins).map(async ([target, list]) => {
      const latest = await store.latestRun(target)
      if (latest === null) return []
      const byNode = keyBy(latest.pairs, (entry) => entry.node)
      return list.flatMap((twin): Placement[] => {
        const found = byNode[twin.twin]
        return found === undefined
          ? []
          : [{node: twin.node, target, path: found.path, confidence: twin.confidence * found.confidence}]
      })
    }),
  )
  return placed.flat()
}

function twinVotes(placements: Placement[]): TwinVote[] {
  return uniqBy(
    placements.toSorted((a, b) => b.confidence - a.confidence),
    (vote) => vote.node,
  ).map(({node, path, confidence}) => ({node, path, confidence}))
}

function soleTexts(input: {matched: Matched[]; exact: boolean}): Matched[] {
  if (!input.exact) return input.matched
  const kept = new Set(
    Object.values(
      groupBy(
        input.matched.filter((entry) => entry.node.kind === 'text'),
        (entry) => entry.component.path,
      ),
    ).flatMap((entries) => {
      const best = maxBy(entries, (entry) => overlapArea({a: entry.node.box, b: entry.component.box}))
      return best === undefined ? [] : [best]
    }),
  )
  return input.matched.filter((entry) => entry.node.kind !== 'text' || kept.has(entry))
}

function overlapArea(input: {a: Box; b: Box}): number {
  const common = intersection(input)
  return common === null ? 0 : common.w * common.h
}

function withTypography(input: {entry: Matched; typography: Record<string, TextNode['typography']>}): Matched {
  const {entry, typography} = input
  if (entry.node.kind !== 'text') return entry
  const found = typography[entry.node.id]
  return found === undefined ? entry : {...entry, node: {...entry.node, typography: found}}
}

function measureDeltas(input: {
  pair: Pair
  pairs: Pair[]
  nodes: TargetNode[]
  live: Raster
  target: Raster
  page: Box
  design: DesignRuntime
  shift: Shift
}): Delta[] {
  const {pair, pairs, nodes, live, target, page, design, shift} = input
  const color = design.comparators.color
  const children = pairs.filter((child) => child.parent === pair)
  const strip = edgeStrip({pair, raster: live, color, shift: {dx: 0, dy: 0}, toward: 'declared'})
  const liveSide = sideFrom({
    pair,
    from: 'live',
    children,
    page,
    raster: live,
    color,
    glyphs: pair.live.glyphs.flatMap((glyph) => glyph.boxes),
    strip,
    nodes,
  })
  const targetSide = sideFrom({
    pair,
    from: 'target',
    children,
    page,
    raster: target,
    color,
    glyphs: pair.texts.map((node) => node.box),
    strip: strip === null ? null : edgeStrip({pair, raster: target, color, shift, toward: 'contrast'}),
    nodes,
  })
  const deltas = design.deltaKinds.flatMap((kind) => kind.measure({live: liveSide, target: targetSide, color}))
  const opinion = opinionSide({side: liveSide, pair, children})
  const confidence = pair.live.opinion?.confidence
  if (opinion === null || confidence === undefined) return deltas
  return deltas.map((delta) => withOpinion({delta, side: opinion, confidence, kinds: design.deltaKinds}))
}

function withOpinion(input: {delta: Delta; side: Side; confidence: number; kinds: DeltaKind[]}): Delta {
  const {delta, side, confidence} = input
  const live = input.kinds.find((kind) => kind.kind === delta.kind)?.read?.(side) ?? null
  if (live === null) return delta
  return {...delta, opinion: {source: 'takumi', live, confidence}}
}

function under(input: {pair: Pair; ancestor: Pair}): boolean {
  const parent = input.pair.parent
  if (parent === null) return false
  return parent === input.ancestor || under({pair: parent, ancestor: input.ancestor})
}

function moved(input: {box: Box; shift: Shift}): Box {
  return {...input.box, x: input.box.x + input.shift.dx, y: input.box.y + input.shift.dy}
}

function decided(input: {deltas: Delta[]; pair: Pair; decisions: Decision[]; color: ColorMetric}): Delta[] {
  const {pair, decisions, color} = input
  const anchors = new Set([pair.node.id, ...pair.texts.map((node) => node.id)])
  const mine = decisions.filter((entry) => anchors.has(entry.anchor))
  const accepted = new Set(mine.filter((entry) => entry.kind === 'accept-delta').map((entry) => String(entry.value)))
  const scale = mine.reduce(
    (found, entry) => (entry.kind === 'tolerance' && typeof entry.value === 'number' ? entry.value : found),
    1,
  )
  return input.deltas
    .filter((delta) => !accepted.has(delta.kind))
    .filter((delta) => scale === 1 || deltaSize({delta, color}) > scale)
}

type TextJudgement = {verdict: TextVerdict; live: string; target: string}

async function textJudgements(input: {pairs: Pair[]; cwd: string}): Promise<Map<Pair, TextJudgement>> {
  const judged = await Promise.all(
    input.pairs
      .filter((pair) => pair.texts.length > 0)
      .map(async (pair): Promise<[Pair, TextJudgement]> => {
        const liveText = joinedText(pair.live.glyphs.map((glyph) => glyph.text))
        const targetText = joinedText(
          pair.texts.toSorted((a, b) => readingBox({a: a.box, b: b.box})).map((node) => node.text),
        )
        const live = await readLiveText({cwd: input.cwd, source: pair.live.source})
        const roles = new Set(pair.texts.map((node) => node.role ?? 'unknown'))
        const [only] = roles
        const role: Role = roles.size === 1 && only !== undefined ? only : 'unknown'
        const equal =
          live === null ? sameWords(liveText) === sameWords(targetText) : literalsAgree({live, liveText, targetText})
        return [
          pair,
          {
            verdict: textDelta({live: live?.role ?? 'literal', target: role, equal}),
            live: liveText,
            target: targetText,
          },
        ]
      }),
  )
  return new Map(judged)
}

function joinedText(texts: string[]): string {
  return texts
    .map((text) => text.trim())
    .filter((text) => text !== '')
    .join(' ')
}

function readingBox(input: {a: Box; b: Box}): number {
  const {a, b} = input
  if (sameLine({a, b})) return a.x - b.x
  return a.y - b.y
}

function slotDeltas(input: {pair: Pair; deltas: Delta[]}): Delta[] {
  const {pair, deltas} = input
  if (pair.node.kind !== 'image') return deltas
  if (pair.live.placeholder === null) return deltas.filter((delta) => !PICTURE_PAINT.has(delta.kind))
  return deltas.filter((delta) => !SLOT_STAGES.has(kindStage(delta.kind)))
}

const SLOT_STAGES = new Set<Stage | null>(['paint', 'content'])
const PICTURE_PAINT = new Set<Delta['kind']>(['background', 'foreground', 'border', 'pixels'])

function pixelRow(input: {pair: Pair; deltas: Delta[]}): Delta[] {
  const {pair, deltas} = input
  if (deltas.length > 0 || pair.mismatch < TOLERANCES.pixelGate) return deltas
  return [{kind: 'pixels', live: rounded(pair.mismatch), target: 0}]
}

function textDeltas(input: {pair: Pair; judged: Map<Pair, TextJudgement>}): Delta[] {
  const found = input.judged.get(input.pair)
  if (found === undefined || found.verdict !== 'text') return []
  return [{kind: 'text', live: found.live, target: found.target}]
}

async function warningDeltas(input: {
  pairs: Pair[]
  judged: Map<Pair, TextJudgement>
  components: LiveComponent[]
  cwd: string
}): Promise<Delta[]> {
  const {judged, cwd} = input
  const parents = new Map(
    flattened(input.components).flatMap((parent) =>
      parent.children.map((child): [string, LiveComponent] => [child.path, parent]),
    ),
  )
  const flagged = await Promise.all(
    input.pairs.map(async (pair): Promise<Delta[]> => {
      const found = judged.get(pair)
      if (found === undefined || found.verdict !== 'sample-data') return []
      const marked = pair.texts.some((node) => node.role === 'placeholder')
      if (!marked && !(await rendersData({pair, parent: parents.get(pair.live.path), cwd}))) return []
      return [
        sourced({
          delta: {kind: 'text', live: found.live, target: found.target, warning: 'sample-data', box: pair.liveBox},
          pair,
        }),
      ]
    }),
  )
  return flagged.flat()
}

async function matchPlaceholder(input: {store: TargetStore; id: string; framework: Framework | null}): Promise<void> {
  if (input.framework !== 'solid') return
  await input.store.writePlaceholder({id: input.id, framework: input.framework})
}

function drawnWarnings(input: {pairs: Pair[]; components: LiveComponent[]; nodes: TargetNode[]}): Delta[] {
  const slots = input.nodes.filter((node) => node.kind === 'image')
  const paired = new Map(input.pairs.map((pair) => [pair.live.path, pair.node]))
  return flattened(input.components).flatMap((component): Delta[] => {
    if (!component.drawn) return []
    const own = paired.get(component.path)
    const slot = own?.kind === 'image' ? own : slots.find((node) => enclosed({inner: component.box, outer: node.box}))
    if (slot === undefined) return []
    const kind = iconSized(slot.box) ? 'icon' : 'image'
    return [
      {
        kind: 'background',
        live: drawnLabel(component.tag),
        target: `<Placeholder kind="${kind}" />`,
        warning: 'svg-drawn',
        selector: component.tag,
        box: component.box,
        ...(component.source === null
          ? {}
          : {via: 'source', file: component.source.file, line: component.source.line, column: component.source.column}),
      },
    ]
  })
}

function drawnLabel(tag: string): string {
  if (tag === 'svg') return 'drawn svg'
  if (tag === 'img') return 'drawn data url'
  return 'drawn canvas'
}

async function rendersData(input: {pair: Pair; parent: LiveComponent | undefined; cwd: string}): Promise<boolean> {
  const {pair, parent, cwd} = input
  if (parent === undefined) return false
  const siblings = parent.children.filter((child) => child.path !== pair.live.path && child.text.trim() !== '')
  const texts = await Promise.all(siblings.map((sibling) => readLiveText({cwd, source: sibling.source})))
  return texts.some((text) => text !== null && text.role !== 'literal')
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

function unbuiltEntries(input: {tree: Tree; pairedNodes: Set<string>}): Unmatched[] {
  const {tree, pairedNodes} = input
  return tree.nodes
    .filter((node) => !pairedNodes.has(node.id))
    .map((node): Unmatched => {
      const structural =
        node.kind !== 'image' && !glyphRun(node) && (node.within === undefined || pairedNodes.has(node.within))
      const layout = entryLayout({node, tree})
      return {
        kind: 'unbuilt',
        target: node.box,
        label: node.kind === 'text' ? `text "${node.text}"` : node.kind,
        stage: structural ? 'structure' : null,
        node: node.id,
        ...(layout === null ? {} : {layout}),
      }
    })
}

function entryLayout(input: {node: TargetNode; tree: Tree}): Unmatched['layout'] | null {
  const {node, tree} = input
  const own = node.layout
  if (own === undefined) return null
  const {direction, size} = own
  if (direction !== undefined) return {direction, size, ...pick(own, CONTAINER_FIELDS)}
  const seat = placement({node, tree})
  return seat === null ? null : {direction: seat.direction, index: seat.index, size}
}

function paintedPage(components: LiveComponent[]): DiffReport['painted'] {
  const total = flattened(components).length
  const outermost = outermostPositioned({components, parentPositioned: false})
  const share = total === 0 ? 0 : outermost.length / total
  if (outermost.length <= TOLERANCES.paintedCount && share <= TOLERANCES.paintedShare) return null
  return {
    count: outermost.length,
    total,
    sources: uniqBy(
      outermost.flatMap((component) => (component.source === null ? [] : [component.source])),
      (source) => `${source.file}:${source.line}:${source.column}`,
    ),
  }
}

function outermostPositioned(input: {components: LiveComponent[]; parentPositioned: boolean}): LiveComponent[] {
  return input.components.flatMap((component) => {
    const {position} = component.styles
    const own = DETACHED_POSITIONS.includes(position) && !input.parentPositioned ? [component] : []
    return [
      ...own,
      ...outermostPositioned({components: component.children, parentPositioned: position !== STATIC_POSITION}),
    ]
  })
}

function extraEntries(input: {components: LiveComponent[]; paired: Set<string>; cards: Box[]}): Unmatched[] {
  const {paired, cards} = input
  const pairedPaths = [...paired]
  return input.components.flatMap((component): Unmatched[] => {
    const holds = paired.has(component.path) || pairedPaths.some((path) => path.startsWith(`${component.path}/`))
    if (!holds && iconSized(component.box) && cards.some((card) => enclosed({inner: component.box, outer: card}))) {
      return []
    }
    if (!holds && paints(component) && large(component.box)) {
      return [
        {
          kind: 'extra',
          live: component.box,
          stage: null,
          ...(component.source === null ? {} : {source: component.source}),
        },
      ]
    }
    return extraEntries({components: component.children, paired, cards})
  })
}

function paints(component: LiveComponent): boolean {
  return component.glyphs.length > 0 || isOpaqueHex(component.styles.background) || component.styles.border.width > 0
}

function large(box: Box): boolean {
  return box.w >= TOLERANCES.unmatchedMinimum && box.h >= TOLERANCES.unmatchedMinimum
}

function offsetEntries(input: {offsets: Offset[]; measured: Measured[]}): Unmatched[] {
  const placed = new Set(
    input.measured
      .filter((entry) => entry.deltas.some((delta) => GEOMETRY_KINDS.includes(delta.kind)))
      .map((entry) => entry.pair),
  )
  return input.offsets.flatMap(({pair, shift}): Unmatched[] => {
    const rounded2 = {dx: Math.round(shift.dx), dy: Math.round(shift.dy)}
    if (pair === null) return [{kind: 'offset', stage: 'geometry', shift: rounded2}]
    if (placed.has(pair)) return []
    return [
      {
        kind: 'offset',
        live: pair.liveBox,
        target: pair.targetBox,
        stage: 'geometry',
        shift: rounded2,
        node: pair.node.id,
        ...(pair.live.source === null ? {} : {source: pair.live.source}),
      },
    ]
  })
}

function reportedComponents(input: {
  measured: Measured[]
  input: DiffInput
  color: ColorMetric
  placements: Placement[]
}): {reported: Reported[]; listed: number} {
  const {measured, color, placements} = input
  const above = measured.filter((entry) => entry.deltas.length > 0 || entry.pair.mismatch >= TOLERANCES.tileGate)
  const impact = (entry: Measured): number =>
    Math.max(0, ...entry.deltas.map((delta) => (delta.confidence ?? 1) * deltaSize({delta, color})))
  const ranked = above
    .map((entry): Reported & {impact: number} => ({
      pair: entry.pair,
      impact: impact(entry),
      report: {
        source: entry.pair.live.source,
        tag: entry.pair.live.tag,
        selector: entry.pair.selector,
        live: entry.pair.liveBox,
        target: entry.pair.targetBox,
        mismatch: rounded(entry.pair.mismatch),
        deltas: entry.deltas,
        children: above.filter((child) => child.pair.parent === entry.pair).length,
        nodes: uniq([entry.pair.node.id, ...entry.pair.texts.map((node) => node.id)]),
        path: entry.pair.live.path,
        ...twinDisagreement({pair: entry.pair, placements}),
      },
    }))
    .filter(({report, pair}) => report.deltas.length > 0 || (report.children === 0 && pair.depth <= input.input.depth))
    .toSorted(
      (a, b) =>
        Number(b.report.deltas.length > 0) - Number(a.report.deltas.length > 0) ||
        b.impact - a.impact ||
        a.pair.liveBox.y - b.pair.liveBox.y ||
        a.pair.depth - b.pair.depth,
    )
  return {
    reported: ranked
      .slice(0, input.input.full === true ? ranked.length : input.input.limit)
      .map(({pair, report}) => ({pair, report})),
    listed: ranked.length,
  }
}

function twinDisagreement(input: {pair: Pair; placements: Placement[]}): Pick<ComponentReport, 'twinDisagreement'> {
  const {pair} = input
  const other = input.placements.find((entry) => entry.node === pair.node.id && entry.path !== pair.live.path)
  if (other === undefined) return {}
  return {twinDisagreement: {target: other.target, path: other.path}}
}

function unpairedShare(input: {unmatched: Unmatched[]; page: Box}): number {
  const area = input.unmatched
    .filter((entry) => entry.kind === 'unbuilt' && entry.stage === 'structure')
    .reduce((sum, entry) => sum + (entry.target === undefined ? 0 : entry.target.w * entry.target.h), 0)
  const total = input.page.w * input.page.h
  return total === 0 ? 0 : Math.min(1, area / total)
}

function residualShare(input: {measured: Measured[]; unmatched: Unmatched[]; masks: Box[]; page: Box}): number {
  const {measured, unmatched, masks, page} = input
  const tiles = measured
    .filter((entry) => entry.deltas.length === 0 && entry.pair.mismatch >= TOLERANCES.tileGate)
    .map((entry) => entry.pair.liveBox)
  const total = page.w * page.h
  if (tiles.length === 0 || total === 0) return 0
  const explained = [
    ...measured.filter((entry) => entry.deltas.length > 0).map((entry) => entry.pair.liveBox),
    ...unmatched.flatMap((entry) => [entry.target, entry.live].filter((box) => box !== undefined)),
    ...masks,
  ]
  const residual = boxMask({boxes: tiles, area: page})
  const covered = boxMask({boxes: explained, area: page})
  const count = residual.reduce((sum, value, index) => sum + (value === 1 && covered[index] !== 1 ? 1 : 0), 0)
  return count / total
}

async function responsiveSection(input: {
  store: TargetStore
  id: string
  model: TargetModel
}): Promise<DiffReport['responsive']> {
  const {store, id, model} = input
  const twins = await store.twins(id)
  const sections = await Promise.all(
    Object.entries(twins).map(async ([other, list]) => {
      const record = await store.find({id: other})
      const otherModel = await store.model(other).then(cssModel, () => null)
      if (record === null || otherModel === null) return []
      return [compareSlices({here: model, there: otherModel, twins: list, width: record.width, target: other})]
    }),
  )
  return sections.flat()
}

function compareSlices(input: {
  here: TargetModel
  there: TargetModel
  twins: TwinPair[]
  width: number
  target: string
}): DiffReport['responsive'][number] {
  const {here, there, twins, width, target} = input
  const twinned = new Map(twins.map((twin) => [twin.node, twin.twin]))
  const thereNodes = new Map(there.nodes.map((node) => [node.id, node]))
  const hereRanks = ranks(here.nodes.filter((node) => twinned.has(node.id)))
  const thereRanks = ranks(there.nodes.filter((node) => [...twinned.values()].includes(node.id)))
  const linked = here.nodes.flatMap((node) => {
    const twin = thereNodes.get(twinned.get(node.id) ?? '')
    return twin === undefined ? [] : [{node, twin}]
  })
  return {
    target,
    width,
    twins: linked.length,
    absent: here.nodes.filter((node) => node.kind !== 'image' && !twinned.has(node.id)).map(nodeLabel),
    reordered: linked
      .filter(({node, twin}) => hereRanks.get(node.id) !== thereRanks.get(twin.id))
      .map(({node}) => nodeLabel(node)),
    stretched: linked
      .filter(
        ({node, twin}) =>
          spans({node, width: here.viewport.width}) !== spans({node: twin, width: there.viewport.width}),
      )
      .map(({node}) => nodeLabel(node)),
  }
}

function ranks(nodes: TargetNode[]): Map<string, number> {
  return new Map(nodes.toSorted((a, b) => readingBox({a: a.box, b: b.box})).map((node, index) => [node.id, index]))
}

function spans(input: {node: TargetNode; width: number}): boolean {
  return input.node.box.w >= STRETCHED * input.width
}

function nodeLabel(node: TargetNode): string {
  if (node.kind === 'text') return node.text
  return `${node.kind} ${Math.round(node.box.w)}×${Math.round(node.box.h)} at ${Math.round(node.box.x)},${Math.round(node.box.y)}`
}

async function linkTwins(input: {store: TargetStore; id: string; session: string}): Promise<void> {
  const {store, id, session} = input
  const others = (await store.list({})).filter((record) => record.session === session && record.id !== id)
  if (others.length === 0) return
  const model = cssModel(await store.model(id))
  await Promise.all(
    others.map(async (other) => {
      const otherModel = await store.model(other.id).then(cssModel, () => null)
      if (otherModel === null) return
      const forward = pairTwins({a: model, b: otherModel, tolerances: TOLERANCES})
      await store.setTwins({id, other: other.id, twins: forward})
      await store.setTwins({
        id: other.id,
        other: id,
        twins: forward.map((twin) => ({node: twin.twin, twin: twin.node, confidence: twin.confidence})),
      })
    }),
  )
}

async function targetStatus(input: {
  store: TargetStore
  session: string
  unanswered: Set<string>
  history: History
}): Promise<StatusReport> {
  const {store} = input
  const record = await store.current({session: input.session})
  if (record === null) return {targets: [], done: false}
  const report = await store.lastResult(record.id)
  const model = await store.model(record.id).catch(() => null)
  const reregister = model === null
  const done = !reregister && (await finished({store, record, report}))
  const ledger = await store.ledger(record.id)
  const sections = await store.sections(record.id)
  const budgets = keyBy(
    sectionBudgets({
      sections,
      items: [],
      rounds: input.history.rounds(record.id),
    }),
    (budget) => budget.id,
  )
  return {
    ...(record.route === undefined ? {} : {route: record.route}),
    targets: [{id: record.id, width: record.width, ...runSummary(report)}],
    done,
    ...loopState({record, report}),
    ledger: ledgerCounts(ledger),
    sections: sections.map((section) => ({
      id: section.id,
      kind: section.kind,
      line: section.line,
      ledger: subtreeCounts({ledger, nodes: section.nodes}),
      roundsUsed: budgets[section.id]?.roundsUsed ?? 0,
      ...withSimilarity(report?.sectionSimilarity[section.id]),
    })),
    ...(report === null ? {} : {changes: report.changes}),
    designPath: store.designPath(record.id),
    placeholderPath: store.placeholderPath(record.id),
    ...statusNext({
      done,
      unanswered: input.unanswered.has(record.id),
      first: (report?.round ?? 0) === 0,
      designPath: store.designPath(record.id),
      placeholderPath: store.placeholderPath(record.id),
      families: model === null ? [] : designFamilies(model.nodes),
    }),
    ...(reregister ? {reregister} : {}),
  }
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

function runSummary(report: DiffReport | null): {mismatch: number | null; above: number; lastAt: number | null} {
  if (report === null) return {mismatch: null, above: 0, lastAt: null}
  return {mismatch: report.mismatch, above: aboveTolerance(report), lastAt: runTime(report)}
}

async function finished(input: {
  store: TargetStore
  record: TargetRecord
  report: DiffReport | null
}): Promise<boolean> {
  const {store, record, report} = input
  if (report === null || runTime(report) === null) return false
  return report.stop === 'done' || acceptedHolds({store, record, report})
}

async function acceptedHolds(input: {store: TargetStore; record: TargetRecord; report: DiffReport}): Promise<boolean> {
  const {store, record, report} = input
  if (record.acceptedRun === undefined) return false
  const accepted = await store.run({id: record.id, run: record.acceptedRun})
  if (accepted === null || accepted.report.capturePath !== report.capturePath) return false
  return !lexicallyWorse({a: report.score, b: accepted.report.score})
}

function loopState(input: {record: TargetRecord; report: DiffReport | null}): Partial<StatusReport> {
  const {record, report} = input
  const accepted = record.acceptedRun === undefined ? {} : {acceptedRun: record.acceptedRun}
  if (report === null) return accepted
  return {
    ...accepted,
    score: report.score,
    round: report.round,
    stop: report.stop,
    ...withSimilarity(report.similarity),
  }
}

function blazediffCompare(input: {a: Raster; b: Raster}): {mismatch: number; mask: Uint8Array} {
  const {a, b} = input
  const output = new Uint8Array(a.data.length)
  const count = diff(a.data, b.data, output, a.width, a.height, DIFF_OPTIONS)
  return pixelResult({output, count, width: a.width, height: a.height})
}

function pixelmatchCompare(input: {a: Raster; b: Raster}): {mismatch: number; mask: Uint8Array} {
  const {a, b} = input
  const output = new Uint8Array(a.data.length)
  const count = pixelmatch(a.data, b.data, output, a.width, a.height, DIFF_OPTIONS)
  return pixelResult({output, count, width: a.width, height: a.height})
}

function targetRuns(target: TargetModel): TextRun[] {
  return target.nodes.flatMap((node) => (node.kind === 'text' ? [{box: node.box, text: node.text}] : []))
}

const DIFF_OPTIONS = {threshold: 0.1, includeAA: false, diffMask: true} as const

function pixelResult(input: {output: Uint8Array; count: number; width: number; height: number}): {
  mismatch: number
  mask: Uint8Array
} {
  const {output, count, width, height} = input
  const total = width * height
  return {mismatch: total === 0 ? 0 : count / total, mask: diffMask({output, width, height})}
}

const LiveComponentTreeSchema: z.ZodType<LiveComponent> = z.object({
  source: SourceLocSchema.nullable(),
  key: z.string().nullable(),
  instance: z.string().nullable().default(null),
  owner: z.string().nullable(),
  tag: z.string(),
  text: z.string(),
  box: BoxSchema,
  textBox: BoxSchema.nullable(),
  glyphs: z.array(GlyphSchema),
  axis: z.enum(['row', 'column']).nullable(),
  columns: z.number().nullable(),
  styles: LiveStylesSchema,
  role: z.string().nullable(),
  hints: z.array(z.string()),
  index: z.number(),
  path: z.string(),
  opinion: OpinionSchema.optional(),
  drawn: z.boolean().default(false),
  placeholder: z.enum(PLACEHOLDER_KINDS).nullable().default(null),
  get children() {
    return z.array(LiveComponentTreeSchema)
  },
})

const MeasureReplySchema = MeasureResultSchema.extend({components: z.array(LiveComponentTreeSchema)})

type MeasureReply = z.infer<typeof MeasureReplySchema>

async function askMeasure(input: {
  width?: number
  height?: number
  timeout?: number
  page: ServerToolPageAccess
}): Promise<MeasureReply> {
  const {width, height, page} = input
  return MeasureReplySchema.parse(
    await page.call(measureDef.name, {
      ...(width === undefined ? {} : {width}),
      ...(height === undefined ? {} : {height}),
      timeout: input.timeout ?? TOLERANCES.measureTimeoutMs,
    }),
  )
}

function liveCapture(reply: MeasureReply): LiveCapture {
  return {
    raster: decodePng(Buffer.from(reply.image, 'base64')),
    viewport: {width: reply.width, height: reply.height},
    route: reply.route,
    components: reply.components,
    capturePath: reply.capturePath,
    source: reply.source,
    masks: reply.masks,
    opinion: reply.opinion,
    framework: reply.framework,
    ...(reply.limits === undefined ? {} : {limits: reply.limits}),
  }
}

function measuredSources(live: LiveCapture): MeasureSource[] {
  return live.opinion ? [live.source, 'takumi'] : [live.source]
}

function sourceConfidence(live: LiveCapture): number {
  if (live.limits === undefined || live.limits.inlineWidths === 0) return 1
  return TOLERANCES.inlineWidthConfidence
}

type TextItem = {side: 'live' | 'target'; text: string; boxes: Box[]; owner: LiveComponent | null}
type Grouped = {group: TextGroup; mask: Box[]}

function flattened(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flattened(component.children)])
}

function readingOrder(a: TextItem, b: TextItem): number {
  const first = a.boxes[0]
  const second = b.boxes[0]
  if (first === undefined || second === undefined) return 0
  if (sameLine({a: first, b: second})) return first.x - second.x
  return first.y - second.y
}

function joined(items: TextItem[]): string {
  return items
    .map((item) => item.text.trim())
    .filter((text) => text !== '')
    .join(' ')
}

function folded(text: string): string {
  return [...text.toLowerCase()].filter((character) => character.trim() !== '').join('')
}

function inkColor(input: {raster: Raster; boxes: Box[]; color: ColorMetric}): string | null {
  const {raster, boxes, color} = input
  const box = expand({box: union(boxes), by: TOLERANCES.tileMargin})
  const tile = crop({raster, box}).raster
  const background = medianColor({raster: tile, exclude: edgeMap(tile)})
  return glyphCoreColor({raster, box, glyphs: boxes, background, color})
}

function inkAgrees(input: {
  live: Raster
  target: Raster
  liveBoxes: Box[]
  targetBoxes: Box[]
  color: ColorMetric
}): boolean {
  const {color} = input
  const a = inkColor({raster: input.live, boxes: input.liveBoxes, color})
  const b = inkColor({raster: input.target, boxes: input.targetBoxes, color})
  return a !== null && b !== null && color.distance({a, b}) <= TOLERANCES.colorDeltaE
}

function placeAgrees(input: {liveBoxes: Box[]; targetBoxes: Box[]}): boolean {
  const a = union(input.liveBoxes)
  const b = union(input.targetBoxes)
  const edges = [a.x - b.x, a.y - b.y, a.x + a.w - b.x - b.w, a.y + a.h - b.y - b.h]
  return edges.every((edge) => Math.abs(edge) <= TOLERANCES.geometryPx)
}

function intersection(input: {a: Box; b: Box}): Box | null {
  const {a, b} = input
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const w = Math.min(a.x + a.w, b.x + b.w) - x
  const h = Math.min(a.y + a.h, b.y + b.h) - y
  return w > 0 && h > 0 ? {x, y, w, h} : null
}

function words(text: string): string[] {
  return [...text]
    .map((character) => (character.trim() === '' ? ' ' : character))
    .join('')
    .split(' ')
    .filter((word) => word !== '')
}

function foundAt(input: {wanted: string[]; among: string[]; from: number}): number | undefined {
  const {wanted, from} = input
  const folds = input.among.map((word) => word.toLowerCase())
  return range(from, Math.max(from, folds.length - wanted.length + 1)).find((start) =>
    wanted.every((word, offset) => folds[start + offset] === word.toLowerCase()),
  )
}

function misaligned(input: {liveItems: TextItem[]; targetText: string}): {item: TextItem; remainder: string} | null {
  const target = words(input.targetText)
  const walk = input.liveItems.reduce<{cursor: number; missing: TextItem | null}>(
    (state, item) => {
      if (state.missing !== null) return state
      const wanted = words(item.text)
      const at = foundAt({wanted, among: target, from: state.cursor})
      return at === undefined ? {cursor: state.cursor, missing: item} : {cursor: at + wanted.length, missing: null}
    },
    {cursor: 0, missing: null},
  )
  if (walk.missing === null) return null
  return {item: walk.missing, remainder: target.slice(walk.cursor).join(' ')}
}

type Constituent = {item: TextItem; trimmed: Box[]; agrees: boolean}

function constituent(input: {item: TextItem; live: Raster; target: Raster; color: ColorMetric}): Constituent {
  const {item, live, target, color} = input
  const trimmed = item.boxes.map((box) => trimToInk({raster: live, box}))
  const agrees = inkAgrees({live, target, liveBoxes: trimmed, targetBoxes: item.boxes, color})
  return {item, trimmed, agrees}
}

function maskedBoxes(input: {constituent: Constituent; targetBoxes: Box[]}): Box[] {
  const {constituent: part, targetBoxes} = input
  const reach = part.trimmed.map((box) => expand({box, by: TOLERANCES.geometryPx}))
  const target = targetBoxes.flatMap((a) => reach.flatMap((b) => intersection({a, b}) ?? []))
  return [...part.trimmed, ...target]
}

function connected(items: TextItem[]): TextItem[][] {
  const parent = items.map((_, index) => index)
  const root = (index: number): number => {
    const above = parent[index] ?? index
    if (above === index) return index
    const top = root(above)
    parent[index] = top
    return top
  }
  items.forEach((item, index) => {
    range(index + 1, items.length).forEach((next) => {
      const touching = item.boxes.some((a) => items[next]?.boxes.some((b) => overlapping({a, b})) === true)
      if (touching) parent[root(next)] = root(index)
    })
  })
  const byRoot = groupBy(range(items.length), (index) => String(root(index)))
  return Object.values(byRoot).map((indexes) => indexes.flatMap((index) => items[index] ?? []))
}

function agreement(input: {parts: Constituent[]; targetBoxes: Box[]; sameText: boolean}): {
  agrees: boolean
  mask: Box[]
} {
  const {parts, targetBoxes, sameText} = input
  const samePlace = placeAgrees({liveBoxes: parts.flatMap((part) => part.trimmed), targetBoxes})
  if (!sameText || !samePlace) return {agrees: false, mask: []}
  const agreeing = parts.filter((part) => part.agrees)
  return {
    agrees: agreeing.length === parts.length,
    mask: agreeing.flatMap((part) => maskedBoxes({constituent: part, targetBoxes})),
  }
}

function attributed(input: {group: TextGroup; liveItems: TextItem[]; sameText: boolean}): TextGroup {
  const {group, liveItems, sameText} = input
  const missing = sameText ? null : misaligned({liveItems, targetText: group.targetText})
  if (missing === null || missing.item.owner === null) return group
  return {...group, liveText: missing.item.text.trim(), targetText: missing.remainder, owner: missing.item.owner}
}

function toGroup(input: {members: TextItem[]; live: Raster; target: Raster; color: ColorMetric}): Grouped | null {
  const {live, target, color} = input
  const sorted = input.members.toSorted(readingOrder)
  const liveItems = sorted.filter((item) => item.side === 'live')
  const targetItems = sorted.filter((item) => item.side === 'target')
  const owner = liveItems[0]?.owner ?? null
  if (owner === null || targetItems.length === 0) return null
  const targetBoxes = targetItems.flatMap((item) => item.boxes)
  const liveText = joined(liveItems)
  const targetText = joined(targetItems)
  const sameText = folded(liveText) === folded(targetText)
  const parts = liveItems.map((item) => constituent({item, live, target, color}))
  const {agrees, mask} = agreement({parts, targetBoxes, sameText})
  const liveBoxes = liveItems.flatMap((item) => item.boxes)
  const group = {live: liveBoxes, target: targetBoxes, liveText, targetText, agrees, owner}
  return {group: attributed({group, liveItems, sameText}), mask}
}

type TextVerdict = 'text' | 'sample-data' | null

function textDelta(input: {live: LiveRole; target: Role; equal: boolean}): TextVerdict {
  const {live, target, equal} = input
  switch (live) {
    case 'expression':
      return null
    case 'mixed':
      return target === 'unknown' && !equal ? 'text' : null
    case 'literal':
      if (equal) return target === 'unknown' ? null : 'sample-data'
      return target === 'placeholder' ? null : 'text'
  }
}

type RouteItem = NonNullable<DiffReport['route']>

const HINT = 'no element carries data-conciv-source; the page is not a dev build compiled by the conciv plugin'
const KEPT_GLYPHS: ReadonlySet<string> = new Set(['%', '$', '€', '£', '¥', '¢', '₪', '₹', '₩', '₽', '₺'])
const UNCHANGED_HINT = 'the page has not changed since the last diff'
const UNANSWERED_HINT = 'the page tab is hidden; bring it to the foreground and run design_diff again'
const PAGE_ERROR_BRIEF = 'the page did not render'
const UNANSWERED_CODES: ReadonlySet<string> = new Set(['page-hidden', 'no-live-widget'])
const ORIGIN_HINT = 'the conciv engine origin is unknown, so xray is a path on the engine and not a full url'
const COMPACT_FIELDS = [
  'target',
  'round',
  'stage',
  'stop',
  'score',
  'mismatch',
  'similarity',
  'brief',
  'timings',
  'rows',
  'xray',
  'diffImage',
  'livePath',
  'capturePath',
  'sources',
  'partial',
  'hint',
  'painted',
  'changes',
  'designPath',
  'placeholderPath',
] as const satisfies readonly (keyof CompactReport & keyof DiffReport)[]
const DETACHED_POSITIONS = ['absolute', 'fixed']
const CONTAINER_FIELDS = ['gap', 'align', 'wrap', 'padding'] as const
const STATIC_POSITION = 'static'
const PARTIAL_HINT =
  'the run was cut short during pairing, so some nodes were never paired and its numbers are not comparable with other rounds; the round was not counted'
const MISMATCH_PRECISION = 10_000
const LIVE_PREFIX = 'live-'
const PNG_SUFFIX = '.png'
const XRAY_LIST = '/xray/list?'
const XRAY_NODE = '/xray/node?'
const COMPARE_REACH = TOLERANCES.blurRadius + 2

function watchMatches(input: {row: WatchRow; query: WatchInput}): boolean {
  const {row, query} = input
  if (query.node !== undefined && row.node !== query.node) return false
  if (query.ref !== undefined && row.ref !== query.ref) return false
  if (query.key !== undefined && row.key !== query.key) return false
  return query.status === undefined || row.status === query.status
}

async function currentTarget(input: {design: DesignRuntime; session: string}): Promise<TargetRecord> {
  const record = await input.design.store.current({session: input.session})
  if (record !== null) return record
  throw toolError('no-target', {message: NO_TARGET_MESSAGE})
}

async function otherRoute(input: {record: TargetRecord; page: ServerToolPageAccess}): Promise<RouteItem | null> {
  const target = input.record.route
  if (target === undefined) return null
  const live = await liveRoute(input.page).catch(() => null)
  if (live === null) return null
  const compared = target.includes('?') ? live : pathnameIn(live)
  return compared === target ? null : {live, target}
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

function paintDiff(input: {live: Raster; mask: Uint8Array; width: number}): Raster {
  const {live, mask, width} = input
  const data = new Uint8Array(live.data)
  mask.forEach((value, index) => {
    if (value !== 1) return
    const x = index % width
    const y = (index - x) / width
    data.set([255, 0, 0, 255], (y * live.width + x) * 4)
  })
  return {width: live.width, height: live.height, data}
}

function withSimilarity(similarity: number | undefined): {similarity?: number} {
  return similarity === undefined ? {} : {similarity}
}

function centred(input: {inner: Box; outer: Box}): boolean {
  const {inner, outer} = input
  const x = inner.x + inner.w / 2
  const y = inner.y + inner.h / 2
  return x >= outer.x && x < outer.x + outer.w && y >= outer.y && y < outer.y + outer.h
}

function rounded(mismatch: number): number {
  return Math.round(mismatch * MISMATCH_PRECISION) / MISMATCH_PRECISION
}

async function resolveWinners(input: {
  wanted: ReturnType<typeof lookups>
  width: number
  height: number
  page: ServerToolPageAccess
}): Promise<WinnerResult> {
  const groups = groupBy(
    uniqBy(input.wanted, (lookup) => lookup.property),
    (lookup) => lookup.owner.selector,
  )
  const results = await Promise.all(
    Object.entries(groups).map(async ([selector, group]) =>
      WinnerResultSchema.parse(
        await input.page.call(winnerDef.name, {
          selector,
          properties: group.map((lookup) => lookup.property),
          width: input.width,
          height: input.height,
        }),
      ),
    ),
  )
  return Object.fromEntries(results.flatMap((result) => Object.entries(result)))
}

async function attribute(input: {
  ranked: Reported
  design: DesignRuntime
  page: ServerToolPageAccess
  cssMap: CssMap
  width: number
  height: number
}): Promise<ComponentReport> {
  const {ranked, design, page, cssMap} = input
  const {pair, report} = ranked
  const winners = await resolveWinners({
    wanted: report.deltas.flatMap((delta) => lookups({delta, pair})),
    width: input.width,
    height: input.height,
    page,
  })
  const deltas = await Promise.all(
    report.deltas.map(async (delta) => {
      if (delta.kind === 'text') return sourced({delta, pair})
      const [found] = lookups({delta, pair}).flatMap(({property, owner}) => {
        const winner = winners[property]
        return winner === null || winner === undefined || winner.inherited ? [] : [{property, winner, owner}]
      })
      if (found === undefined) return delta
      const provenance = await mapDeclaration({
        winner: found.winner,
        property: found.property,
        component: found.owner.live,
        target: delta.target,
        cwd: design.cwd,
        cssMap,
        mappers: design.mappers,
      })
      return {...delta, ...provenance}
    }),
  )
  return {...report, deltas}
}

async function withProvenance(input: {
  ranked: Reported[]
  design: DesignRuntime
  page: ServerToolPageAccess
  width: number
  height: number
}): Promise<ComponentReport[]> {
  const {ranked, design, page, width, height} = input
  if (ranked.length === 0) return []
  const cssMap = await design.cssMap()
  return Promise.all(ranked.map((entry) => attribute({ranked: entry, design, page, cssMap, width, height})))
}

function literalsAgree(input: {live: LiveText; liveText: string; targetText: string}): boolean {
  const {live, liveText, targetText} = input
  if (live.role !== 'mixed') return sameWords(liveText) === sameWords(targetText)
  const target = sameWords(targetText)
  return live.literals.every((literal) => target.includes(sameWords(literal)))
}

export function sameWords(text: string): string {
  const points = Array.from(text.trim()).flatMap((point) => Array.from(CONFUSABLES[point] ?? point))
  if (!points.some(casedLetter)) return folded(points.join(''))
  const start = loneGlyph(points[0]) ? 1 : 0
  const end = loneGlyph(points.at(-1)) ? points.length - 1 : points.length
  return folded(points.slice(start, end).join(''))
}

function casedLetter(point: string): boolean {
  return point.toLowerCase() !== point.toUpperCase()
}

function loneGlyph(point: string | undefined): boolean {
  if (point === undefined || casedLetter(point) || KEPT_GLYPHS.has(point)) return false
  return point < '0' || point > '9'
}

function sourced(input: {delta: Delta; pair: Pair}): Delta {
  const {source} = input.pair.live
  if (source === null) return input.delta
  return {...input.delta, via: 'source', file: source.file, line: source.line, column: source.column}
}

function reportHint(input: {
  attributed: boolean
  absolute: boolean
  partial: boolean
  cut: {listed: number; shown: number; paired: number}
}): {hint?: string} {
  const {cut} = input
  const hints = [
    input.partial ? PARTIAL_HINT : null,
    cut.listed <= cut.shown
      ? null
      : `showing ${cut.shown} of ${cut.paired} paired components, those with deltas first; full: true lists up to limit of each and truncated says how many more`,
    input.attributed ? null : HINT,
    input.absolute ? null : ORIGIN_HINT,
  ].filter((hint) => hint !== null)
  return hints.length === 0 ? {} : {hint: hints.join('; ')}
}

function runTime(report: DiffReport): number | null {
  const at = Number(basename(report.livePath).split('-')[1])
  return Number.isFinite(at) ? at : null
}

function shaped(input: {report: DiffReport; design: string[] | null; limit: number}): CompactReport {
  const {report} = input
  const counts = {
    components: report.components.length,
    paired: report.paired,
    unbuilt: report.unmatched.filter((entry) => entry.kind === 'unbuilt').length,
    icons: report.unmatched.filter(
      (entry) =>
        entry.kind === 'unbuilt' && entry.label === 'image' && entry.target !== undefined && iconSized(entry.target),
    ).length,
    unmatched: report.unmatched.length,
    warnings: report.warnings.length,
    done: report.ledger.done,
    regressed: report.ledger.regressed,
    drawn: report.warnings.filter((warning) => warning.warning === 'svg-drawn').length,
  }
  if (input.design !== null) {
    return {
      ...report,
      components: report.components.slice(0, input.limit),
      unmatched: report.unmatched.slice(0, input.limit),
      truncated: {
        components: Math.max(0, report.components.length - input.limit),
        unmatched: Math.max(0, report.unmatched.length - input.limit),
      },
      design: input.design,
      counts,
    }
  }
  return {...pick(report, COMPACT_FIELDS), counts}
}

async function captureStep(
  ...[input, ctx, , page]: Parameters<ServerStep<CaptureInput, CaptureResult>>
): Promise<CaptureResult> {
  const live = liveCapture(await askMeasure({height: input.height, timeout: input.timeout, page}))
  const path = await ctx.design.store.writeCapture({png: encodePng(live.raster)})
  return {path, width: live.raster.width, height: live.raster.height, route: live.route, components: live.components}
}

async function clearStep(
  ...[input, ctx, request]: Parameters<ServerStep<ClearInput, ClearResult>>
): Promise<ClearResult> {
  const {store} = ctx.design
  const id = input.target ?? (await store.current({session: request.sessionId}))?.id
  return {removed: await store.remove(input.all === true ? {all: true} : {id})}
}

async function winnerStep(
  ...[input, , , page]: Parameters<ServerStep<WinnerInput, WinnerResult>>
): Promise<WinnerResult> {
  return WinnerResultSchema.parse(await page.call(winnerDef.name, input))
}
