import {toolError} from '@conciv/extension'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import type {ComponentReport, DiffInput, DiffReport} from '../../shared/defs.js'
import {TOLERANCES} from '../../shared/tolerances.js'
import type {DesignRuntime, Pair, Raster, ServerStep, TargetRecord} from '../../shared/types.js'
import {sideFrom} from '../../server/deltas.js'
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

export const diffStep: ServerStep<DiffInput, DiffReport> = async (input, ctx, _request, page) => {
  const {design} = ctx
  const record = await findTarget({query: input, design, page})
  const target = await design.store.model(record.id)
  const live = await design.capture.capture({route: record.route, width: record.width, height: record.height, page})
  const matched = design.matcher.match({live, target, comparators: design.comparators, depth: input.depth})
  const pageBox = {x: 0, y: 0, w: live.viewport.width, h: live.viewport.height}
  const reported = matched.pairs.filter((pair) => pair.mismatch >= TOLERANCES.tileGate)
  const components = reported
    .map((pair): {pair: Pair; report: ComponentReport} => {
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
    .map(({report}) => report)
  return design.store.writeRun({
    id: record.id,
    live: live.raster,
    diff: paintDiff({live: live.raster, mask: matched.mask, width: Math.min(live.raster.width, target.raster.width)}),
    result: {
      target: {id: record.id, route: record.route, width: record.width},
      mismatch: rounded(matched.mismatch),
      components,
      unmatched: unmatchedRegions({target, matched: matched.matchedTargetBoxes, pairs: matched.pairs, live}),
      ...(live.components.length === 0 ? {hint: HINT} : {}),
    },
  })
}
