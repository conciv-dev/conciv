import {randomUUID} from 'node:crypto'
import {groupBy, maxBy} from 'es-toolkit'
import {
  DiffReportSchema,
  NO_CHANGES,
  type Box,
  type Decision,
  type Delta,
  type Design,
  type DesignNode,
  type DesignRuntime,
  type DiffReport,
  type Fresh,
  type Judging,
  type LiveCapture,
  type LiveComponent,
  type Match,
  type MatchText,
  type Measured,
  type Round,
  type Run,
  type Runner,
  type Settled,
  type Store,
  type TextRun,
  type Typography,
} from '../shared/defs.js'
import {TOLERANCES} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import {expand, intersection} from '../shared/box.js'
import {boxMask, encodePng} from './raster.js'

export function createRunner(input: {runtime: DesignRuntime}): Runner {
  return {fresh: (fresh) => freshRun({...fresh, runtime: input.runtime})}
}

async function freshRun(
  input: Fresh & {runtime: DesignRuntime},
): Promise<{report: DiffReport; settled: Settled; round: Round | null}> {
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
    clock,
    runtime,
  } = input
  const {store, measurer, judge, deltas, pixels} = runtime
  const reading = measuredPage.capture
  const base = await baseRun({store, id: record.id})
  const live = {
    ...reading,
    raster: pixels.paintOver({onto: reading.raster, from: css.raster, boxes: [...reading.masks, ...css.dropped]}),
  }
  clock.lap('capture')
  const stamp = {source: live.source, confidence: measurer.confidence(live), width: record.width}
  const {grid, rawTiles, reuse} = pixels.reuse({before: settled ?? null, live: live.raster, target: css.raster})
  const texts = measurer.texts({
    components: live.components,
    runs: textRuns(css.design.root),
    live: live.raster,
    target: css.raster,
    reuse,
  })
  const slots = [...walk({root: css.design.root})].flatMap(({node}) => (node.kind === 'image' ? [node.box] : []))
  const masked = pixels.paintOver({
    onto: live.raster,
    from: css.raster,
    boxes: [...texts.agreeing.map((box) => expand({box, by: TOLERANCES.glyphHalo + TOLERANCES.blurRadius})), ...slots],
  })
  const compared = pixels.compare({live: masked, target: css.raster, previous: settled?.tiles ?? null, clock})
  const scored = pixels.similarity({
    live: masked,
    target: css.raster,
    mask: boxMask({
      boxes: [...reading.masks, ...css.dropped, ...slots],
      area: {x: 0, y: 0, w: compared.width, h: compared.height},
    }),
    differing: compared.mask,
    width: compared.width,
    height: compared.height,
  })
  const similarity = rounded(pixels.mean({tiles: scored}))
  const sectionSimilarity = Object.fromEntries(
    css.design.root.children.map((section) => [
      section.id,
      rounded(pixels.mean({tiles: scored, within: roundedBox(section.box)})),
    ]),
  )
  clock.lap('similarity')
  const twins = await runtime.twins.placements(record.id)
  const pageRoot = pageComponent(live)
  clock.skip()
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
  clock.lap('pair')
  const exact = css.design.source.kind !== 'image'
  const sole = soleTexts({root: paired.root, exact})
  const typography = await measurer.typography({texts: textOwners(sole), raster: css.raster, page})
  await Promise.all(
    Object.entries(typography.estimates)
      .filter(([node]) => !decisions.some((decision) => decision.kind === 'typography' && decision.anchor === node))
      .map(([node, value]) => store.decide({id: record.id, kind: 'typography', anchor: node, value})),
  )
  const root = typed({match: sole, estimates: typography.estimates})
  clock.lap('typography')
  const elements = deltas.elements({
    root,
    live: pageRoot,
    raster: live.raster,
    exact,
    source: live.source,
    mismatchAt: (box) => pixels.share({...compared, box: expand({box, by: TOLERANCES.tileMargin})}),
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
  clock.lap('deltas')
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
  clock.lap('judge')
  const pageWidth = Math.min(live.raster.width, css.raster.width)
  const images = {
    live: encodePng(live.raster),
    diff: encodePng(pixels.paintDiff({live: masked, mask: compared.mask, width: pageWidth})),
  }
  clock.lap('encode')
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
  clock.lap('write')
  const hinted = {attributed: live.components.length > 0, absolute: xray.absolute, partial: paired.partial}
  const pairedCount = [...walk({root})].filter(({node, depth}) => depth > 0 && node.live !== null).length
  const report = DiffReportSchema.parse({
    ...verdict,
    timings: {
      ...clock.timings(),
      carried: {pairs: paired.carried, tiles: compared.carried},
      ...(measuredPage.longestTask === undefined ? {} : {longestTask: measuredPage.longestTask}),
    },
    target: {id: record.id, ...(record.route === undefined ? {} : {route: record.route}), width: record.width},
    xray: xray.url,
    diffImage: runtime.projections.relative(run.images.diff),
    livePath: runtime.projections.relative(run.images.live),
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
    responsive: await runtime.twins.responsive({id: record.id, design: css.design}),
    partial: paired.partial,
    paired: pairedCount,
    changes: changed.changes,
    ledger: judge.counts(run.root.children),
    ...runtime.projections.paths(record.id),
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
      const best = maxBy(entries, (entry) => overlapArea({a: entry.match.node.box, b: entry.live.box}))
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

function overlapArea(input: {a: Box; b: Box}): number {
  const common = intersection(input)
  return common === null ? 0 : common.w * common.h
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
