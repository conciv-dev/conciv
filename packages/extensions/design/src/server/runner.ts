import type {Storage} from 'unstorage'
import {AsyncRetryer} from '@tanstack/pacer/async-retryer'
import type {RawFrame, SourceLoc} from '@conciv/protocol/page-types'
import {toolError} from '@conciv/extension'
import type {
  CompileError,
  DesignRuntime,
  IdNode,
  IdTree,
  Measured,
  Raster,
  Round,
  RoundReply,
  Runner,
} from '../shared/defs.js'
import type {Component} from '../shared/catalog-defs.js'
import {designConfig} from '../shared/tolerances.js'
import {readIds} from '../shared/id-tree.js'
import {walk} from '../shared/tree.js'
import {createRaster} from './raster.js'
import {idTreeOf} from './id-tree.js'
import {mappingOf} from './mapping.js'
import {gateOf} from './gate.js'
import {reflowAt} from './reflow.js'
import {widthsOf} from './widths.js'
import {verdictOf} from './verdict.js'
import {progressOf} from './progress.js'
import {imageRowsOf} from './image-rows.js'
import {classifyDrift} from './catalog/drift.js'
import {createTokenMap} from './catalog/token-map.js'
import {pageHeightRows} from './page-height.js'
import {driftRows} from './drift.js'
import {ROUTE_HINT} from '../shared/route-hint.js'

export function createRunner(input: {runtime: DesignRuntime; folder: Storage}): Runner {
  return (call) => run({...input, call})
}

async function run(input: {runtime: DesignRuntime; folder: Storage; call: Call}): Promise<RoundReply> {
  const {runtime, call} = input
  const {store} = runtime
  const {record} = call
  const held = await heldOf({store, id: record.id})
  const oneWidth = record.widget === 'shown'
  const history = historyOf(held.rounds)
  const {previous} = history
  const {measured, built, widths, since} = await settledMeasures({runtime, call, held, history, oneWidth})
  const thrown = await thrownError({measured, since, runtime})
  if (thrown !== null) return {thrown}
  const count = held.streak + 1
  const facts = factsOf(measured)
  const round = await store.nextRound(record.id)
  const reasonAt = (rendered: number) =>
    unsettledReason({measured, rendered, settled: history.settled, route: record.route})
  const early = (state: {unsettled: string | null; rendered: number; root: IdNode}) =>
    store.writeCheck({
      id: record.id,
      state: 'unsettled',
      rendered: state.rendered,
      tree: built.hash,
      shots: [
        {width: measured.width, screenshot: measured.raster.png(), tree: treeOf(state.root), queries: measured.queries},
      ],
      ...(state.unsettled === null ? {} : {unsettled: state.unsettled}),
    })
  if (stillBlank({measured, held})) {
    await store.writeUnsettledCount({id: record.id, count})
    await early({unsettled: reasonAt(0), rendered: 0, root: built.root})
    return {unsettled: true, rendered: 0, ...facts}
  }
  if (previous !== undefined && unchangedSince({history, built})) {
    await store.writeUnsettledCount({id: record.id, count: previous.unsettled === null ? 0 : count})
    await store.writeCheck({id: record.id, state: 'unchanged', sameAs: previous.round})
    return {...shown(previous), unchanged: true}
  }
  const paired = await pairedOf({runtime, held, measured, round, built, settled: history.settled})
  const unsettled = reasonAt(paired.coverage.rendered)
  await store.writeUnsettledCount({id: record.id, count: unsettled === null ? 0 : count})
  if (unsettled !== null && count < TOLERANCES.stallRounds) {
    await early({unsettled, rendered: paired.coverage.rendered, root: paired.mapped.root})
    return {unsettled: true, rendered: paired.coverage.rendered, ...facts}
  }
  const reply = await measuredRound({
    ...input,
    held,
    measured,
    widths,
    history,
    built,
    round,
    paired,
    unsettled,
    oneWidth,
  })
  return unsettled === null ? reply : {...reply, unsettled: true, rendered: paired.coverage.rendered, ...facts}
}

type Call = Parameters<Runner>[0]

type WidthMeasure = {width: number; from: string[]; measured: Measured}

type MeasuresInput = {runtime: DesignRuntime; call: Call; held: Held; history: History; oneWidth: boolean}

type Measures = {measured: Measured; built: ReturnType<typeof idTreeOf>; widths: WidthMeasure[]; since: number}

const MEASURE_ATTEMPTS = 3

const EDITED_WHILE_MEASURING = 'the page kept changing while the check measured it; check again once the edits stop'

async function settledMeasures(input: MeasuresInput): Promise<Measures> {
  const retryer = new AsyncRetryer(() => measuresOf(input), {
    backoff: 'fixed',
    baseWait: 0,
    maxAttempts: (self) =>
      self.store.state.lastError === undefined || self.store.state.lastError.message === EDITED_WHILE_MEASURING
        ? MEASURE_ATTEMPTS
        : self.store.state.currentAttempt,
    throwOnError: 'last',
  })
  const measures = await retryer.execute()
  if (measures === undefined) throw new Error(EDITED_WHILE_MEASURING)
  return measures
}

async function measuresOf(input: MeasuresInput): Promise<Measures> {
  const {runtime, call, held, history, oneWidth} = input
  const {record} = call
  const since = call.edits.updated()
  const measured = await runtime.measurer.measure({
    page: call.page,
    ...(oneWidth ? {} : {width: record.width}),
    height: record.height,
    widget: record.widget,
    fresh: true,
  })
  const built = idTreeOf({live: measured.live, sheets: measured.sheets, mapping: held.stored, previous: held.ids})
  const early = unchangedSince({history, built}) || stillBlank({measured, held})
  const widths = early ? [] : await widthMeasures({runtime, call, held, measured, oneWidth})
  if (call.edits.updated() === since) return {measured, built, widths, since}
  await call.edits.quiet()
  throw new Error(EDITED_WHILE_MEASURING)
}

async function widthMeasures(input: {
  runtime: DesignRuntime
  call: Call
  held: Held
  measured: Measured
  oneWidth: boolean
}): Promise<WidthMeasure[]> {
  const {runtime, call, measured} = input
  const {design} = input.held
  const widths = input.oneWidth
    ? [{width: measured.width, from: [WIDGET_SHOWN]}]
    : widthsOf({design, styles: measured.queries, ...(call.variants === undefined ? {} : {variants: call.variants})})
  const measures: WidthMeasure[] = []
  for (const {width, from} of widths)
    measures.push({
      width,
      from,
      measured:
        width === measured.width
          ? measured
          : await runtime.measurer.measure({
              page: call.page,
              width,
              height: REFLOW_HEIGHT,
              widget: call.record.widget,
              fresh: false,
            }),
    })
  return measures
}

function blankOf(measured: Measured): boolean {
  return measured.pageError !== undefined || measured.live.children.length === 0
}

function stillBlank(input: {measured: Measured; held: Held}): boolean {
  return blankOf(input.measured) && input.held.streak + 1 < TOLERANCES.stallRounds
}

function unchangedSince(input: {history: History; built: ReturnType<typeof idTreeOf>}): boolean {
  const {previous, last} = input.history
  return previous !== undefined && previous === last && previous.tree === input.built.hash
}

type Held = Awaited<ReturnType<typeof heldOf>>

type History = ReturnType<typeof historyOf>

type Paired = Awaited<ReturnType<typeof pairedOf>>

async function heldOf(input: {store: DesignRuntime['store']; id: string}) {
  const {store, id} = input
  const [design, stored, rounds, image, ids, streak] = await Promise.all([
    store.design(id),
    store.mapping(id),
    store.rounds(id),
    store.image({id}),
    store.ids({id}),
    store.unsettledCount(id),
  ])
  if (image === null) throw toolError('no-target', {message: 'the design image is missing; call design_get again'})
  return {design, stored, rounds, image, ids, streak}
}

function factsOf(measured: Measured): {route: string; error?: string} {
  if (measured.pageError === undefined) return {route: measured.route}
  return {route: measured.route, error: measured.pageError}
}

function historyOf(rounds: Round[]) {
  const measuredRounds = rounds.filter((round) => round.broken === null)
  return {
    last: rounds.at(-1),
    measuredRounds,
    previous: measuredRounds.at(-1),
    settled: measuredRounds.findLast((round) => round.unsettled === null),
  }
}

async function pairedOf(input: {
  runtime: DesignRuntime
  held: Held
  measured: Measured
  round: number
  built: ReturnType<typeof idTreeOf>
  settled: Round | undefined
}) {
  const {held, measured, settled} = input
  const {design} = held
  const decoded = createRaster(held.image)
  const target = design.scale === 1 ? decoded : decoded.scaled(design.scale)
  const voted = {design, measured, stored: held.stored, round: input.round, pairer: input.runtime.pairer, target}
  const first = await gatedOf({...voted, built: input.built})
  const collapsed =
    measured.pageError === undefined && settled !== undefined && first.coverage.rendered < settled.coverage.rendered / 2
  const chosen = collapsed ? await revotedOf({...voted, previous: held.ids}) : first
  return {...chosen, target}
}

async function measuredRound(input: {
  runtime: DesignRuntime
  folder: Storage
  call: Call
  held: Held
  measured: Measured
  widths: WidthMeasure[]
  history: History
  built: ReturnType<typeof idTreeOf>
  round: number
  paired: Paired
  unsettled: string | null
  oneWidth: boolean
}) {
  const {runtime, call, held, measured, round, paired, unsettled} = input
  const {store} = runtime
  const {record} = call
  const {design} = held
  const {mapped, coverage} = paired
  await store.writeVotes({id: record.id, round, votes: mapped.votes})
  const tree = {root: mapped.root, revoted: mapped.revoted, gone: mapped.gone}
  const relation =
    unsettled === null ? await store.writeRelation({id: record.id, round, tree}) : new Map<string, Component>()
  const reflowed = await reflowOf({...input, mapping: mapped.mapping})
  const listed = await listedRows({...input, relation, failures: reflowed.failures})
  const {rows, counts} = listed
  const pixels = compared({live: measured.raster, target: paired.target, comparator: runtime.comparator})
  const designShot = {
    width: measured.width,
    screenshot: measured.raster.png(),
    diff: pixels.diff,
    mask: pixels.mask,
    tree,
    queries: measured.queries,
  }
  const progress = await progressAt({...input, rows, pixels})
  const judged = unsettled === null ? coverage : {...coverage, gone: goneOf({design, missing: coverage.missing})}
  const drawn: Round = {
    round,
    rows,
    reflow: reflowed.reflow,
    coverage: judged,
    counts,
    pixels: {share: pixels.share},
    progress,
    at: Date.now(),
    tree: input.built.hash,
    verdict: 'unsettled',
    unsettled,
    broken: null,
    brokenBy: null,
  }
  const written =
    unsettled === null
      ? {...drawn, verdict: verdictOf({design, rounds: [...input.history.measuredRounds, drawn]}).verdict}
      : drawn
  await store.writeRound({
    id: record.id,
    round: written,
    slight: paired.gate.slight,
    shots: [designShot, ...reflowed.shots],
    imageMismatch: Object.fromEntries(listed.ratios.map(({node, ratio}) => [node, ratio])),
    ...(unsettled === null ? {ids: {tree, revoted: mapped.reasons}} : {}),
    notes: [`capture ${measured.path}`, ...(input.oneWidth ? [WIDGET_SHOWN] : [])],
  })
  const late = reflowed.waits.length === 0 ? {} : {fontsLoading: Math.max(...reflowed.waits)}
  return {round, rows, reflow: reflowed.reflow, coverage: judged, counts, progress, ...late}
}

async function reflowOf(input: {
  held: Held
  measured: Measured
  widths: WidthMeasure[]
  mapping: Paired['mapped']['mapping']
}) {
  const {measured, mapping} = input
  const {design} = input.held
  const widths = input.widths.map(({width, from}) => ({width, from}))
  const results = []
  const failures = []
  const waits = measured.fontsLoading === undefined ? [] : [measured.fontsLoading]
  const shots: Shot[] = []
  for (const {width, measured: narrow} of input.widths) {
    if (narrow !== measured && narrow.fontsLoading !== undefined) waits.push(narrow.fontsLoading)
    const at = idTreeOf({live: narrow.live, sheets: narrow.sheets, mapping, previous: null})
    if (narrow !== measured)
      shots.push({width, screenshot: narrow.raster.png(), tree: treeOf(at.root), queries: narrow.queries})
    const measuredAt = reflowAt({
      root: design.root,
      reads: readIds({root: at.root, live: narrow.live}),
      live: narrow.live,
      width,
      overflowX: narrow.overflowX,
    })
    results.push(measuredAt.reflow)
    failures.push(...measuredAt.rows)
  }
  return {reflow: {widths, results}, failures, waits, shots}
}

async function listedRows(input: {
  runtime: DesignRuntime
  folder: Storage
  call: Call
  held: Held
  measured: Measured
  history: History
  paired: Paired
  unsettled: string | null
  relation: Map<string, Component>
  failures: Round['rows']
}) {
  const {runtime, call, measured, paired, relation, failures} = input
  const {design} = input.held
  const {gate} = paired
  const {record} = call
  const reads = readIds({root: paired.mapped.root, live: measured.live})
  const tall = [
    ...pageHeightRows({
      root: design.root,
      live: measured.live,
      reads,
      width: measured.width,
      scrollHeight: measured.scrollHeight,
    }),
    ...driftRows({root: design.root, reads, width: measured.width}),
  ]
  const images = await imageRowsOf({
    design,
    reads,
    page: call.page,
    mirror: measured.sources.includes('mirror') ? {width: record.width, height: record.height} : null,
    folder: input.folder,
  })
  const listed = [...tall, ...gate.rows, ...images.rows, ...failures]
  const classified = await drifted({runtime, rows: listed, relation, scheme: measured.scheme})
  const drift = classified.filter((row) => row.magnitude === 'token-drift').length
  const replaced = listed.length - classified.length + drift
  const named =
    input.unsettled === null
      ? await runtime.components.rows({
          design,
          reads,
          relation,
          earlier: await Promise.all(
            input.history.measuredRounds.map((earlier) =>
              runtime.store.relation({id: record.id, round: earlier.round}),
            ),
          ),
        })
      : []
  const counts = {
    ...gate.counts,
    reflow: gate.counts.reflow + tall.length + failures.length,
    paint: (gate.counts.paint ?? 0) + images.rows.length - replaced,
    rows: gate.counts.rows + tall.length + images.rows.length + failures.length - replaced + named.length,
    drift,
  }
  return {rows: [...classified, ...named], counts, ratios: images.ratios}
}

async function progressAt(input: {
  runtime: DesignRuntime
  call: Call
  held: Held
  measured: Measured
  history: History
  paired: Paired
  rows: Round['rows']
  pixels: {share: number}
}) {
  const {runtime, measured, history, paired} = input
  const {previous} = history
  const earlier =
    previous === undefined
      ? null
      : await runtime.store.image({id: input.call.record.id, round: previous.round, kind: 'live'})
  return progressOf({
    rounds: history.measuredRounds,
    now: {rows: input.rows, coverage: paired.coverage, pixels: {share: input.pixels.share}},
    live: {now: measured.raster, before: earlier === null ? null : createRaster(earlier), width: measured.width},
    root: paired.mapped.root,
    design: input.held.design,
    comparator: runtime.comparator,
  })
}

function goneOf(input: {design: Held['design']; missing: string[]}): {id: string; name: string}[] {
  const names = new Map([...walk(input.design.root)].map(({node}) => [node.id, node.figma?.name ?? '']))
  return input.missing.map((id) => ({id, name: names.get(id) ?? ''}))
}

const REFLOW_HEIGHT = 900

const WIDGET_SHOWN = 'widget shown: one width'

async function revotedOf(input: Omit<Parameters<typeof mappingOf>[0], 'built'> & {previous: IdTree | null}) {
  const {measured, stored, previous} = input
  const built = idTreeOf({live: measured.live, sheets: measured.sheets, mapping: stored, previous, revote: true})
  return gatedOf({...input, built, revote: true})
}

async function gatedOf(input: Parameters<typeof mappingOf>[0]) {
  const mapped = await mappingOf(input)
  const reads = readIds({root: mapped.root, live: input.measured.live})
  const gate = gateOf({design: input.design, reads, live: input.measured.live})
  const coverage = {
    ...gate.coverage,
    dupes: mapped.dupes,
    candidates: mapped.candidates,
    revoted: mapped.revoted.length,
    notRendered: [...gate.coverage.notRendered, ...mapped.notRendered],
  }
  return {mapped, gate, coverage}
}

const TOLERANCES = designConfig.tolerances

async function drifted(input: {
  runtime: DesignRuntime
  rows: Round['rows']
  relation: Map<string, Component>
  scheme: Measured['scheme']
}): Promise<Round['rows']> {
  const {runtime, relation} = input
  const read = relation.size === 0 ? [] : runtime.tokens.map((source) => source.read({cwd: runtime.cwd}))
  const tokens = createTokenMap({tokens: (await Promise.all(read)).flat()})
  return classifyDrift({rows: input.rows, relation, tokens, scheme: input.scheme})
}

function unsettledReason(input: {
  measured: Measured
  rendered: number
  settled: Round | undefined
  route: string | undefined
}): string | null {
  const {measured, rendered, settled} = input
  if (measured.pageError !== undefined) return `The page shows an error: ${measured.pageError}`
  if (rendered === 0 && input.route !== undefined) return `The page at ${measured.route} rendered no design nodes.`
  if (rendered === 0) return `The page at ${measured.route} rendered no design nodes. ${ROUTE_HINT}`
  if (settled === undefined || rendered >= settled.coverage.rendered / 2) return null
  return `The page rendered ${rendered} design nodes, under half the ${settled.coverage.rendered} of round ${settled.round}.`
}

async function thrownError(input: {
  measured: Measured
  since: number
  runtime: DesignRuntime
}): Promise<CompileError | null> {
  const {measured, runtime} = input
  const {thrown} = measured
  if (thrown === undefined || (thrown.at < input.since && measured.live.children.length > 0)) return null
  const at = await located({frames: thrown.frames, runtime})
  if (at === null) return {message: thrown.message, file: null, line: null, column: null}
  return {message: thrown.message, file: at.file, line: at.line, column: at.column}
}

async function located(input: {frames: RawFrame[]; runtime: DesignRuntime}): Promise<SourceLoc | null> {
  const [frame, ...rest] = input.frames
  if (frame === undefined) return null
  const at = await input.runtime.symbolicate([frame])
  return at ?? located({...input, frames: rest})
}

function shown(last: Round): RoundReply {
  const {round, rows, reflow, coverage, counts, progress} = last
  return {round, rows, reflow, coverage, counts, progress}
}

function compared(input: {live: Raster; target: Raster; comparator: string}) {
  const {live, target} = input
  const box = {x: 0, y: 0, w: Math.min(live.width, target.width), h: Math.min(live.height, target.height)}
  const cropped = live.crop({box})
  const {mismatch, mask} = cropped.compare({other: target.crop({box}), comparator: input.comparator})
  return {share: mismatch, diff: cropped.paintDiff({mask, width: box.w}).png(), mask: {pixels: mask, width: box.w}}
}

function treeOf(root: IdNode): IdTree {
  return {root, revoted: [], gone: []}
}

type Shot = NonNullable<Parameters<DesignRuntime['store']['writeRound']>[0]['shots']>[number]
