import {randomUUID} from 'node:crypto'
import {isAbsolute, relative} from 'node:path'
import {groupBy, mapValues, maxBy} from 'es-toolkit'
import {toolError} from '@conciv/extension'
import {
  DiffReportSchema,
  NO_CHANGES,
  NO_TARGET_MESSAGE,
  type Box,
  type Css,
  type Decision,
  type Delta,
  type Design,
  type DesignNode,
  type DesignRuntime,
  type DiffReport,
  type Judging,
  type Lap,
  type LiveCapture,
  type LiveComponent,
  type Match,
  type MatchText,
  type Measured,
  type Phase,
  type Run,
  type Runner,
  type Store,
  type TextRun,
  type Typography,
  TWIN_SEPARATOR,
} from '../shared/defs.js'
import {TOLERANCES} from '../shared/tolerances.js'
import {find, walk} from '../shared/tree.js'
import {area, boxMask, expand, intersection, readingOrder} from '../shared/box.js'
import {createRaster} from './raster.js'

export function createRunner(runtime: DesignRuntime): Runner {
  return {
    css: (input) => loadCss({...input, store: runtime.store}),
    timings: timingsOf,
    paths: (id) => targetPaths({context: runtime, id}),
    run: async (input) => {
      const context = {...input, runtime}
      const measured = measureStage(context)
      const paired = await pairStage({...context, ...measured})
      const found = await deltasStage({...context, ...measured, ...paired})
      const judged = judgeStage({...context, ...measured, ...paired, ...found})
      return writeStage({...context, ...measured, ...paired, ...found, ...judged})
    },
  }
}

type Context = Parameters<Runner['run']>[0] & {runtime: DesignRuntime}

function measureStage(input: Context) {
  const {runtime, css, settled, laps} = input
  const {measurer} = runtime
  const reading = input.reply.capture
  const live = {
    ...reading,
    raster: measurer.paintOver({onto: reading.raster, from: css.raster, boxes: [...reading.masks, ...css.dropped]}),
  }
  laps.push({phase: 'capture', at: Date.now()})
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
    mask: boxMask({
      boxes: [...reading.masks, ...css.dropped, ...slots],
      within: {x: 0, y: 0, w: compared.width, h: compared.height},
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
  return {live, grid, rawTiles, reuse, texts, masked, compared, similarity, sectionSimilarity}
}

async function pairStage(input: Context & ReturnType<typeof measureStage>) {
  const {runtime, css, live, decisions, record, laps} = input
  const {store, measurer} = runtime
  const base = await baseRun({store, id: record.id})
  const pageRoot = pageComponent(live)
  laps.push({phase: null, at: Date.now()})
  const paired = await runtime.pairer({
    design: css.design,
    live: pageRoot,
    decisions,
    previous: base?.root ?? null,
    rasters: {live: live.raster, target: css.raster},
    twins: input.twins.map(({node, path}) => ({node, path})),
    comparators: runtime.comparators,
    budget: TOLERANCES.pairBudgetMs,
  })
  laps.push({phase: 'pair', at: Date.now()})
  const exact = css.design.source.kind !== 'image'
  const sole = soleTexts({root: paired.root, exact})
  const typography = await measurer.typography({texts: textOwners(sole), raster: css.raster, page: input.page})
  await Promise.all(
    Object.entries(typography.estimates)
      .filter(([node]) => !decisions.some((decision) => decision.kind === 'typography' && decision.anchor === node))
      .map(([node, value]) => store.decide({id: record.id, kind: 'typography', anchor: node, value})),
  )
  laps.push({phase: 'typography', at: Date.now()})
  return {base, pageRoot, paired, exact, typography, root: typed({match: sole, estimates: typography.estimates})}
}

async function deltasStage(input: Context & ReturnType<typeof measureStage> & Awaited<ReturnType<typeof pairStage>>) {
  const {runtime, css, live, root, exact, compared, record, decisions, laps} = input
  const {measurer, deltas, judge} = runtime
  const stamp = {source: live.source, confidence: measurer.confidence(live), width: record.width}
  const elements = deltas.elements({
    root,
    live: input.pageRoot,
    raster: live.raster,
    exact,
    source: live.source,
    mismatchAt: (box) => measurer.share({...compared, box: expand({box, by: TOLERANCES.tileMargin})}),
  })
  const alignment = runtime.geometry.align({root, live: live.raster, exact})
  const page = {x: 0, y: 0, w: live.viewport.width, h: live.viewport.height}
  const found = await deltas.measure({
    elements,
    reuse: input.reuse,
    shift: alignment.global,
    live: live.raster,
    target: css.raster,
    page,
    decisions,
    stamp,
  })
  const unmatched = judge.unmatched({
    root,
    components: live.components,
    offsets: alignment.offsets,
    measured: found.measured,
  })
  const {reported, listed} = judge.report({measured: found.measured, input: input.job.input, twins: input.twins})
  const components = await runtime.provenance.attribute({
    ranked: reported,
    page: input.page,
    width: record.width,
    height: record.height,
    sourced: deltas.sourced,
  })
  const enriched = new Map(
    reported.map((entry, index) => [entry.element, components[index]?.deltas ?? entry.report.deltas]),
  )
  const measured: Measured[] = found.measured.map((entry) => ({
    element: entry.element,
    deltas: enriched.get(entry.element) ?? entry.deltas,
  }))
  const items = judge.items({components: measured, unmatched, root})
  const warnings = (await deltas.warnings({elements, judged: found.judged, components: live.components, root})).map(
    (delta) => ({...delta, ...stamp}),
  )
  const score = judge.score({items, unmatched, measured, masks: css.dropped, page})
  laps.push({phase: 'deltas', at: Date.now()})
  return {stamp, found, unmatched, reported, listed, components, measured, items, warnings, score}
}

function judgeStage(
  input: Context &
    ReturnType<typeof measureStage> &
    Awaited<ReturnType<typeof pairStage>> &
    Awaited<ReturnType<typeof deltasStage>>,
) {
  const {runtime, job, rounds, paired, base, decisions, live, items, measured, root, settled} = input
  const {judge} = runtime
  const advances = job.observe && !paired.partial
  const id = runId()
  const round = advances ? rounds.length + 1 : rounds.length
  const crop = (node: string): string => cropUrl({xray: input.xray.url, node, run: id})
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
  const earlier = settled?.report.similarity
  const judging: Judging = {
    items,
    score: input.score,
    capturePath: live.capturePath,
    capture: input.capture,
    warnings: input.warnings,
    painted: judge.painted(live.components),
    partial: paired.partial,
    changed,
    crop,
    similarity: earlier === undefined ? null : {now: input.similarity, was: earlier},
  }
  const verdict = judge.verdict({...judging, priors: advances ? rounds : rounds.slice(0, -1), round})
  input.laps.push({phase: 'judge', at: Date.now()})
  return {advances, id, round, settledTree, changed, judging, verdict}
}

async function writeStage(
  input: Context &
    ReturnType<typeof measureStage> &
    Awaited<ReturnType<typeof pairStage>> &
    Awaited<ReturnType<typeof deltasStage>> &
    ReturnType<typeof judgeStage>,
): ReturnType<Runner['run']> {
  const {runtime, css, live, record, paired, compared, root, judging, verdict, laps, xray, job} = input
  const {store, measurer, judge} = runtime
  const images = {
    live: live.raster.png(),
    diff: measurer
      .paintDiff({live: input.masked, mask: compared.mask, width: Math.min(live.raster.width, css.raster.width)})
      .png(),
  }
  laps.push({phase: 'encode', at: Date.now()})
  const run = await store.writeRun({
    run: {
      id: input.id,
      round: input.round,
      design: record.id,
      root: input.settledTree.root,
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
      ...(input.reply.longestTask === undefined ? {} : {longestTask: input.reply.longestTask}),
    },
    target: {id: record.id, ...(record.route === undefined ? {} : {route: record.route}), width: record.width},
    xray: xray.url,
    diffImage: reportPath({cwd: runtime.cwd, path: run.images.diff}),
    livePath: reportPath({cwd: runtime.cwd, path: run.images.live}),
    mismatch: rounded(compared.mismatch),
    similarity: input.similarity,
    sectionSimilarity: input.sectionSimilarity,
    components: input.components,
    unmatched: input.unmatched,
    warnings: [...input.warnings, ...typographyWarnings({...input.typography, stamp: input.stamp})],
    painted: judging.painted,
    segmentation: segmentationQuality(css.design),
    capturePath: live.capturePath,
    sources: measurer.sources(live),
    responsive: await responsiveTwins({store, id: record.id, design: css.design}),
    partial: paired.partial,
    paired: pairedCount,
    changes: input.changed.changes,
    ledger: judge.counts(run.root.children),
    ...targetPaths({context: runtime, id: record.id}),
    pinsLost: pinsLost({decisions: input.decisions, root}),
    ...(live.limits === undefined ? {} : {limits: live.limits}),
    ...judge.hint({...hinted, cut: {listed: input.listed, shown: input.reported.length, paired: pairedCount}}),
  })
  return {
    run,
    report,
    round: input.advances
      ? judge.round({
          items: input.items,
          score: input.score,
          capturePath: live.capturePath,
          capture: input.capture,
          report,
          section: job.input.section,
        })
      : null,
    settled: {
      capture: input.capture,
      observe: job.observe,
      run,
      report,
      judging,
      measured: input.measured,
      twins: input.twins,
      hinted: {...hinted, paired: pairedCount},
      grid: input.grid,
      rawTiles: input.rawTiles,
      tiles: compared.tiles,
      textMasks: input.texts.masks,
      measures: input.found.measures,
    },
  }
}

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

const NO_BOX: Box = {x: 0, y: 0, w: 0, h: 0}

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

function reportPath(input: {cwd: string; path: string}): string {
  return isAbsolute(input.path) ? relative(input.cwd, input.path) : input.path
}

function targetPaths(input: {context: DesignRuntime; id: string}): {designPath: string; placeholderPath: string} {
  const {context, id} = input
  const path = (key: string): string => reportPath({cwd: context.cwd, path: context.store.path(key) ?? key})
  return {designPath: path(`${id}:design.txt`), placeholderPath: path(`${id}:placeholder.tsx`)}
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

const STRETCHED = 0.85

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

function spans(input: {box: DesignNode['box']; width: number}): boolean {
  return input.box.w >= STRETCHED * input.width
}

function nodeLabel(node: DesignNode): string {
  if (node.kind === 'text') return node.text
  return `${node.kind} ${Math.round(node.box.w)}×${Math.round(node.box.h)} at ${Math.round(node.box.x)},${Math.round(node.box.y)}`
}
