import {createHash} from 'node:crypto'
import {isAbsolute, relative} from 'node:path'
import {mapValues, uniqBy} from 'es-toolkit'
import {toolError} from '@conciv/extension'
import type {
  Box,
  Decision,
  Design,
  DesignNode,
  DesignRuntime,
  DiffReport,
  Match,
  Measured,
  Pairer,
  Run,
  Runner,
  Store,
  TargetRecord,
} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {box} from '../shared/box.js'
import {designConfig} from '../shared/tolerances.js'
import {createRaster} from './raster.js'

export function createRunner(runtime: DesignRuntime): Runner {
  return (input) => runOnce({...input, runtime})
}

type Typography = Extract<Decision['value'], {size: number}>

type Twin = Extract<Decision['value'], {target: string}>

type Phase = keyof Omit<DiffReport['timings'], 'total' | 'carried' | 'longestTask'>

type Timings = DiffReport['timings']

const TOLERANCES = designConfig.tolerances

const PAGE_ERROR = 'page-error'

const UNSETTLED = 'unsettled'

const STRETCHED = 0.85

async function runOnce(input: Parameters<Runner>[0] & {runtime: DesignRuntime}): ReturnType<Runner> {
  const {runtime, record, page, observe} = input
  const {store} = runtime
  const clock = startClock()
  const [stored, decisions, previous, image, rounds] = await Promise.all([
    store.design(record.id),
    store.decisions(record.id),
    store.latest(record.id),
    store.image({id: record.id}),
    countedRounds({store, record}),
  ])
  if (image === null) throw toolError('no-target', {message: runtime.words.hint({kind: 'no-target'})})
  clock.lap(null)
  const measured = await runtime.measurer.measure({page, width: record.width, height: record.height})
  clock.lap('measure')
  if (measured.pageError !== undefined) throw toolError(PAGE_ERROR, {message: measured.pageError})
  const {design, excluded} = inCss({design: stored, decisions})
  const capture = captureOf({raster: measured.raster, decisions})
  const accepted = new Set(decisions.filter((decision) => decision.kind === 'accept-node').map(({anchor}) => anchor))
  const twins = await twinPaths({store, id: record.id})
  const shared = {...input, clock, measured, design, decisions, previous, twins, excluded, capture}
  if (observe && input.edited.length === 0 && previous !== null && previous.capture === capture) {
    if (rounds.at(-1)?.id === previous.id) return unchanged({...shared, run: previous})
    if (!previous.partial) return counted({...shared, run: previous, rounds, accepted})
  }
  const decoded = createRaster(image)
  const target = stored.scale === 1 ? decoded : decoded.scaled(stored.scale)
  clock.lap('decode')
  const paired = await runtime.pairer({
    design,
    measured,
    target,
    previous,
    decisions,
    twins,
    edited: input.edited,
    budget: TOLERANCES.pairBudgetMs,
  })
  clock.lap('pair')
  const broken = unsettled({root: paired.root, previous, measured})
  if (broken !== null) throw toolError(UNSETTLED, {message: broken})
  const found = await runtime.deltas.compute({
    root: paired.root,
    design,
    measured,
    target,
    previous,
    decisions,
    page,
    project: runtime.project,
    excluded,
    limit: input.input.limit,
  })
  clock.lap('deltas')
  await keepTypography({store, id: record.id, root: found.root, design, decisions})
  clock.lap('typography')
  const advances = observe && !paired.partial
  const id = runId()
  const judged = runtime.judge({
    root: found.root,
    extras: found.extras,
    warnings: found.warnings,
    previous: rounds.at(-1) ?? null,
    rounds: advances ? rounds : rounds.slice(0, -1),
    decisions,
    accepted,
    run: id,
    ...(input.input.section === undefined ? {} : {section: input.input.section}),
    capture,
    path: measured.path,
    partial: paired.partial,
    excluded,
  })
  clock.lap('judge')
  const live = measured.raster.png()
  const diff = found.diff.png()
  clock.lap('encode')
  return written({
    ...shared,
    previous: rounds.at(-1) ?? null,
    live,
    diff,
    timings: timingsOf({
      clocked: clock.timings(),
      measured,
      carried: {pairs: paired.carried, tiles: found.timings.carried ?? 0},
      phases: found.timings,
    }),
    run: {
      id,
      round: advances ? rounds.length + 1 : rounds.length,
      design: record.id,
      root: judged.root,
      extras: found.extras,
      score: judged.score,
      stage: judged.stage,
      stop: judged.stop,
      mismatch: found.mismatch,
      similarity: found.similarity,
      capture,
      section: input.input.section ?? null,
      items: judged.items,
      sections: found.sections,
      partial: paired.partial,
      path: measured.path,
    },
  })
}

function unsettled(input: {root: Match; previous: Run | null; measured: Measured}): string | null {
  const paired = pairedCount(input.root)
  const before = input.previous === null ? 0 : pairedCount(input.previous.root)
  if (before === 0 || paired >= before / 2) return null
  const elements = [...walk(input.measured.live)].length - 1
  return `${elements} elements on the page, ${paired} paired where the last settled run paired ${before}`
}

function pairedCount(root: Match): number {
  return [...walk(root)].filter(({node, depth}) => depth > 0 && node.live !== null).length
}

type Shared = Parameters<Runner>[0] & {
  runtime: DesignRuntime
  clock: ReturnType<typeof startClock>
  measured: Awaited<ReturnType<DesignRuntime['measurer']['measure']>>
  design: Design
  decisions: Decision[]
  previous: Run | null
  twins: Parameters<Pairer>[0]['twins']
  excluded: Box[]
  capture: string
}

async function unchanged(input: Shared & {run: Run}): ReturnType<Runner> {
  const timings = timingsOf({
    clocked: input.clock.timings(),
    measured: input.measured,
    carried: {pairs: 0, tiles: 0},
    phases: {},
  })
  const report = await reportOf({...input, timings})
  return {run: input.run, report: {...report, hint: input.runtime.words.hint({kind: 'unchanged'})}}
}

async function counted(input: Shared & {run: Run; rounds: Run[]; accepted: Set<string>}): ReturnType<Runner> {
  const {runtime, record, run, rounds, decisions, accepted, clock} = input
  const {store} = runtime
  const id = runId()
  const judged = runtime.judge({
    root: run.root,
    extras: run.extras,
    warnings: [],
    previous: rounds.at(-1) ?? null,
    rounds,
    decisions,
    accepted,
    run: id,
    ...(input.input.section === undefined ? {} : {section: input.input.section}),
    capture: run.capture,
    path: run.path,
    partial: run.partial,
    excluded: input.excluded,
  })
  clock.lap('judge')
  const [live, diff] = await Promise.all([
    store.image({id: record.id, run: run.id, kind: 'live'}),
    store.image({id: record.id, run: run.id, kind: 'diff'}),
  ])
  const own = clock.timings()
  const settled = run.timings
  return written({
    ...input,
    previous: rounds.at(-1) ?? null,
    live: live ?? new Uint8Array(),
    diff: diff ?? new Uint8Array(),
    timings: {
      ...settled,
      judge: own.judge,
      write: 0,
      total: settled.total - settled.judge - settled.write + own.judge,
    },
    run: {
      ...run,
      id,
      round: rounds.length + 1,
      root: judged.root,
      score: judged.score,
      stage: judged.stage,
      stop: judged.stop,
      section: input.input.section ?? null,
      items: judged.items,
    },
  })
}

async function written(
  input: Shared & {
    run: Omit<Run, 'images' | 'timings' | 'above'>
    previous: Run | null
    live: Uint8Array
    diff: Uint8Array
    timings: Timings
  },
): ReturnType<Runner> {
  const {runtime, clock, timings} = input
  const run = {...input.run, images: imageKeys({design: input.run.design, run: input.run.id}), timings, above: 0}
  const report = await reportOf({...input, run})
  const stored = await runtime.store.writeRun({
    run: {...run, above: aboveOf(report)},
    live: input.live,
    diff: input.diff,
    report,
  })
  clock.lap('write')
  const write = clock.timings().write
  return {run: stored, report: {...report, timings: {...timings, write, total: timings.total + write}}}
}

function imageKeys(input: {design: string; run: string}): Run['images'] {
  const base = `${input.design}:runs:${input.run}`
  return {live: `${base}:live.png`, diff: `${base}:diff.png`}
}

function aboveOf(report: DiffReport): number {
  const unbuilt = report.unmatched.filter((entry) => entry.kind === 'unbuilt' && entry.stage === 'structure').length
  return (report.truncated?.above ?? 0) + unbuilt
}

function timingsOf(input: {
  clocked: Omit<Timings, 'carried'>
  measured: Measured
  carried: Timings['carried']
  phases: Record<string, number>
}): Timings {
  const {clocked, measured, phases} = input
  return {
    ...clocked,
    ...Object.fromEntries(DELTA_PHASES.map((phase) => [phase, phases[phase] ?? clocked[phase]])),
    carried: input.carried,
    ...(measured.longestTask === undefined ? {} : {longestTask: measured.longestTask}),
  }
}

async function reportOf(input: Shared & {run: Run; previous: Run | null; timings: Timings}): Promise<DiffReport> {
  const {runtime, record, run, measured, design, decisions} = input
  const {store} = runtime
  const report = runtime.words.report({
    run,
    previous: input.previous,
    items: run.items,
    measured,
    design,
    record,
    input: input.input,
    paths: {
      live: reportPath({cwd: runtime.cwd, path: store.path(run.images.live) ?? run.images.live}),
      diff: reportPath({cwd: runtime.cwd, path: store.path(run.images.diff) ?? run.images.diff}),
      xray: runtime.xrayUrl({id: record.id, session: input.session}).url,
    },
    timings: input.timings,
    decisions,
    twins: input.twins,
  })
  return {...report, responsive: await responsiveTwins({store, decisions, design})}
}

const DELTA_PHASES = ['capture', 'mask', 'similarity', 'regions'] as const

function captureOf(input: {raster: Measured['raster']; decisions: Decision[]}): string {
  const kept = input.decisions.filter((decision) => decision.kind !== 'typography' && decision.kind !== 'twin')
  return createHash('sha256').update(input.raster.pixels()).update(JSON.stringify(kept)).digest('hex')
}

function startClock(): {lap: (phase: Phase | null) => void; timings: () => Omit<DiffReport['timings'], 'carried'>} {
  const started = Date.now()
  const laps: {phase: Phase | null; at: number}[] = [{phase: null, at: started}]
  const ms = (phase: Phase): number =>
    laps.reduce((sum, lap, index) => {
      const before = laps[index - 1]
      return lap.phase === phase && before !== undefined ? sum + lap.at - before.at : sum
    }, 0)
  return {
    lap: (phase) => {
      laps.push({phase, at: Date.now()})
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
      total: Date.now() - started,
    }),
  }
}

async function countedRounds(input: {store: Store; record: TargetRecord}): Promise<Run[]> {
  const {store, record} = input
  const ids = await store.runs(record.id)
  const accepted = record.acceptedRun === undefined ? -1 : ids.indexOf(record.acceptedRun)
  const loaded = await Promise.all(ids.slice(accepted + 1).map((run) => store.run({id: record.id, run})))
  const rounds = loaded.flatMap((run) => (run === null || run.round === 0 ? [] : [run]))
  return uniqBy(rounds, (run) => run.round)
}

function inCss(input: {design: Design; decisions: Decision[]}): {design: Design; excluded: Box[]} {
  const {design, decisions} = input
  const by = 1 / design.scale
  const page = scaledBox({box: design.root.box, by})
  const excluded = new Set(
    decisions
      .filter((decision) => decision.kind === 'excluded' || decision.kind === 'image-slot')
      .map((decision) => decision.anchor),
  )
  const typography = new Map(
    decisions.flatMap((decision) =>
      decision.kind === 'typography' &&
      typeof decision.value === 'object' &&
      decision.value !== null &&
      'size' in decision.value
        ? [[decision.anchor, decision.value] as const]
        : [],
    ),
  )
  const dropped: Box[] = []
  const convert = (node: DesignNode): DesignNode[] => {
    const scaled = scaledNode({node, by, typography: typography.get(node.id)})
    if (excluded.has(node.id) || outside({box: scaled.box, page})) {
      dropped.push(...[...walk(scaled)].map((visit) => visit.node.box))
      return []
    }
    return [{...pagedNode({node: scaled, page}), children: node.children.flatMap(convert)}]
  }
  const root = {
    ...scaledNode({node: design.root, by, typography: undefined}),
    children: design.root.children.flatMap(convert),
  }
  return {design: {...design, scale: 1, viewport: {width: page.w, height: page.h}, root}, excluded: dropped}
}

function scaledNode(input: {node: DesignNode; by: number; typography: Typography | undefined}): DesignNode {
  const {node, by} = input
  const scaled = scaledBox({box: node.box, by})
  const layout = node.layout === undefined ? undefined : scaledLayout({layout: node.layout, by})
  const base = {...node, box: scaled, ...(layout === undefined ? {} : {layout})}
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
  const {by} = input
  return {x: input.box.x * by, y: input.box.y * by, w: input.box.w * by, h: input.box.h * by}
}

function outside(input: {box: Box; page: Box}): boolean {
  const {page} = input
  const {x, y, w, h} = input.box
  return x >= page.x + page.w || x + w <= page.x || y >= page.y + page.h || y + h <= page.y
}

function pagedNode(input: {node: DesignNode; page: Box}): DesignNode {
  const {node, page} = input
  const clipped = box.intersection({a: node.box, b: page})
  if (clipped === null) return node
  const {layout} = node
  const padding = layout?.padding
  if (layout === undefined || padding === undefined) return {...node, box: clipped}
  const cut = {
    left: clipped.x - node.box.x,
    right: node.box.x + node.box.w - (clipped.x + clipped.w),
    top: clipped.y - node.box.y,
    bottom: node.box.y + node.box.h - (clipped.y + clipped.h),
  }
  const inset = {
    left: Math.max(0, padding.left - cut.left),
    right: Math.max(0, padding.right - cut.right),
    top: Math.max(0, padding.top - cut.top),
    bottom: Math.max(0, padding.bottom - cut.bottom),
  }
  return {...node, box: clipped, layout: {...layout, padding: inset}}
}

async function twinPaths(input: {store: Store; id: string}): Promise<Parameters<Pairer>[0]['twins']> {
  const {store, id} = input
  const twins = (await store.decisions(id)).filter((decision) => decision.kind === 'twin')
  const placed = await Promise.all(
    twins.map(async (decision) => {
      const twin = twinOf(decision)
      if (twin === null) return []
      const {target, node} = twin
      const run = await store.latest(target)
      const found = run === null ? null : pairedNode({root: run.root, id: node})
      if (found === null || found.live === null) return []
      return [{node: decision.anchor, path: found.live.path, confidence: found.confidence}]
    }),
  )
  return uniqBy(
    placed.flat().toSorted((a, b) => b.confidence - a.confidence),
    (twin) => twin.node,
  )
}

function twinOf(decision: Decision): Twin | null {
  const {value} = decision
  if (decision.kind !== 'twin' || typeof value !== 'object' || value === null || !('target' in value)) return null
  return value
}

function pairedNode(input: {root: Match; id: string}): Match | null {
  for (const {node, depth} of walk(input.root)) {
    if (depth > 0 && node.node.id === input.id) return node
  }
  return null
}

async function keepTypography(input: {
  store: Store
  id: string
  root: Match
  design: Design
  decisions: Decision[]
}): Promise<void> {
  const {store, id, decisions} = input
  const decided = new Set([
    ...decisions.filter((decision) => decision.kind === 'typography').map((decision) => decision.anchor),
    ...[...walk(input.design.root)].flatMap(({node}) =>
      node.kind === 'text' && node.typography?.confidence === 1 ? [node.id] : [],
    ),
  ])
  const estimates = [...walk(input.root)].flatMap(({node: match}) =>
    match.node.kind === 'text' && match.node.typography !== undefined && !decided.has(match.node.id)
      ? [{anchor: match.node.id, value: match.node.typography}]
      : [],
  )
  await Promise.all(estimates.map(({anchor, value}) => store.decide({id, kind: 'typography', anchor, value})))
}

function runId(): string {
  return `${Date.now()}-${crypto.randomUUID().slice(0, 4)}`
}

function reportPath(input: {cwd: string; path: string}): string {
  const inside = relative(input.cwd, input.path)
  return isAbsolute(input.path) && !inside.startsWith('..') ? inside : input.path
}

async function responsiveTwins(input: {
  store: Store
  decisions: Decision[]
  design: Design
}): Promise<DiffReport['responsive']> {
  const {store, design} = input
  const twins = input.decisions.flatMap((decision) => {
    const twin = twinOf(decision)
    return twin === null ? [] : [{anchor: decision.anchor, ...twin}]
  })
  const byTarget = Map.groupBy(twins, (twin) => twin.target)
  const sections = await Promise.all(
    [...byTarget].map(async ([target, decisions]) => {
      const record = await store.record(target)
      const there = await store.design(target).catch(() => null)
      if (record === null || there === null) return []
      const twinned = new Map(decisions.map((twin) => [twin.anchor, twin.node]))
      return [compareSlices({here: design, there, twinned, width: record.width, target})]
    }),
  )
  return sections.flat()
}

function compareSlices(input: {
  here: Design
  there: Design
  twinned: Map<string, string>
  width: number
  target: string
}): DiffReport['responsive'][number] {
  const {here, there, twinned, width, target} = input
  const hereNodes = nodesOf(here.root)
  const thereNodes = new Map(nodesOf(there.root).map((node) => [node.id, node]))
  const twinIds = new Set(twinned.values())
  const hereRanks = ranks(hereNodes.filter((node) => twinned.has(node.id)))
  const thereRanks = ranks([...thereNodes.values()].filter((node) => twinIds.has(node.id)))
  const linked = hereNodes.flatMap((node) => {
    const twin = thereNodes.get(twinned.get(node.id) ?? '')
    return twin === undefined ? [] : [{node, twin}]
  })
  const thereWidth = there.viewport.width / there.scale
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
          spans({w: node.box.w, width: here.viewport.width}) !==
          spans({w: twin.box.w / there.scale, width: thereWidth}),
      )
      .map(({node}) => nodeLabel(node)),
  }
}

function nodesOf(root: DesignNode): DesignNode[] {
  return [...walk(root)].flatMap(({node, depth}) => (depth === 0 ? [] : [node]))
}

function ranks(nodes: DesignNode[]): Map<string, number> {
  return new Map(
    nodes.toSorted((a, b) => box.readingOrder({a: a.box, b: b.box})).map((node, index) => [node.id, index]),
  )
}

function spans(input: {w: number; width: number}): boolean {
  return input.w >= STRETCHED * input.width
}

function nodeLabel(node: DesignNode): string {
  if (node.kind === 'text') return node.text
  return `${node.kind} ${Math.round(node.box.w)}×${Math.round(node.box.h)} at ${Math.round(node.box.x)},${Math.round(node.box.y)}`
}
