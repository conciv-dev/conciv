import {toolError} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {
  winnerDef,
  WinnerResultSchema,
  type ComponentReport,
  type DiffInput,
  type DiffReport,
} from '../../shared/defs.js'
import {TOLERANCES} from '../../shared/tolerances.js'
import type {CssMap, Delta, DesignRuntime, Pair, Raster, ServerStep, TargetRecord} from '../../shared/types.js'
import {withBreakpoints} from '../../server/breakpoints.js'
import {sideFrom} from '../../server/deltas.js'
import {DELTA_PROPERTIES} from '../../server/provenance/delta-properties.js'
import {mapDeclaration} from '../../server/provenance/mappers.js'
import {unmatchedRegions} from '../../server/unmatched.js'
import {liveRoute, targetWidth} from './target.js'

const HINT = 'no element carries data-conciv-source; the page is not a dev build compiled by the conciv plugin'
const MISMATCH_PRECISION = 10_000

async function findTarget(input: {
  query: DiffInput
  design: DesignRuntime
  page: ServerToolPageAccess
}): Promise<TargetRecord> {
  const {query, design, page} = input
  if (query.target !== undefined) {
    const byId = await design.store.find({id: query.target})
    if (byId !== null) return byId
    throw toolError('no-target', {message: `no design target with id ${query.target}; register one with design_target`})
  }
  const width = await targetWidth({width: query.width, page})
  const route = await liveRoute(page)
  const pathname = route.split('?')[0] ?? route
  const record = (await design.store.find({route, width})) ?? (await design.store.find({route: pathname, width}))
  if (record !== null) return record
  throw toolError('no-target', {
    message: `no design target for ${route} at ${width}px; register one with design_target`,
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

function rounded(mismatch: number): number {
  return Math.round(mismatch * MISMATCH_PRECISION) / MISMATCH_PRECISION
}

function area(pair: Pair): number {
  return pair.liveBox.w * pair.liveBox.h
}

type Ranked = {pair: Pair; report: ComponentReport}

function candidates(input: {delta: Delta; pair: Pair}): string[] {
  return DELTA_PROPERTIES[input.delta.kind]({delta: input.delta, axis: input.pair.live.axis})
}

async function attribute(input: {
  ranked: Ranked
  design: DesignRuntime
  page: ServerToolPageAccess
  cssMap: CssMap
}): Promise<ComponentReport> {
  const {ranked, design, page, cssMap} = input
  const {pair, report} = ranked
  const properties = [...new Set(report.deltas.flatMap((delta) => candidates({delta, pair})))]
  const winners = WinnerResultSchema.parse(await page.call(winnerDef.name, {selector: pair.selector, properties}))
  const deltas = await Promise.all(
    report.deltas.map(async (delta) => {
      const [found] = candidates({delta, pair}).flatMap((property) => {
        const winner = winners[property]
        return winner === null || winner === undefined || winner.inherited ? [] : [{property, winner}]
      })
      if (found === undefined) return delta
      const provenance = await mapDeclaration({
        ...found,
        component: pair.live,
        target: delta.target,
        cwd: design.cwd,
        cssMap,
      })
      return {...delta, ...provenance}
    }),
  )
  return {...report, deltas}
}

async function withProvenance(input: {
  ranked: Ranked[]
  design: DesignRuntime
  page: ServerToolPageAccess
}): Promise<ComponentReport[]> {
  const {ranked, design, page} = input
  if (ranked.length === 0) return []
  const cssMap = await design.cssMap()
  return Promise.all(ranked.map((entry) => attribute({ranked: entry, design, page, cssMap})))
}

export const diffStep: ServerStep<DiffInput, DiffReport> = async (input, ctx, _request, page) => {
  const {design} = ctx
  const record = await findTarget({query: input, design, page})
  const target = await design.store.model(record.id)
  const live = await design.capture.capture({route: record.route, width: record.width, height: record.height, page})
  const matched = design.matcher.match({live, target, comparators: design.comparators, depth: input.depth})
  const pageBox = {x: 0, y: 0, w: live.viewport.width, h: live.viewport.height}
  const reported = matched.pairs.filter((pair) => pair.mismatch >= TOLERANCES.tileGate)
  const ranked = reported
    .map((pair): Ranked => {
      const children = matched.pairs.filter((child) => child.parent === pair)
      const liveSide = sideFrom({pair, from: 'live', children, page: pageBox, raster: live.raster})
      const targetSide = sideFrom({pair, from: 'target', children, page: pageBox, raster: target.raster})
      const deltas =
        liveSide === null || targetSide === null
          ? []
          : design.deltaKinds.flatMap((kind) =>
              kind.measure({live: liveSide, target: targetSide, color: design.comparators.color}),
            )
      return {
        pair,
        report: {
          source: pair.live.source,
          tag: pair.live.tag,
          selector: pair.selector,
          live: pair.liveBox,
          target: pair.targetBox,
          mismatch: rounded(pair.mismatch),
          deltas,
          children: reported.filter((child) => child.parent === pair).length,
        },
      }
    })
    .filter(({report}) => report.deltas.length > 0)
    .toSorted((a, b) => b.pair.mismatch * area(b.pair) - a.pair.mismatch * area(a.pair))
    .slice(0, input.limit)
  const components = await withProvenance({ranked, design, page})
  return design.store.writeRun({
    id: record.id,
    live: live.raster,
    diff: paintDiff({live: live.raster, mask: matched.mask, width: Math.min(live.raster.width, target.raster.width)}),
    result: await withBreakpoints({
      record,
      store: design.store,
      result: {
        target: {id: record.id, route: record.route, width: record.width},
        xray: design.xrayUrl(record.id),
        mismatch: rounded(matched.mismatch),
        components,
        unmatched: unmatchedRegions({target, matched: matched.matchedTargetBoxes, pairs: matched.pairs, live}),
        ...(live.components.length === 0 ? {hint: HINT} : {}),
      },
    }),
  })
}
