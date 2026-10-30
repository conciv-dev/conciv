import {basename} from 'node:path'
import type {DiffReport, StatusInput, StatusReport} from '../../shared/defs.js'
import {TOLERANCES} from '../../shared/tolerances.js'
import type {Box, ServerStep} from '../../shared/types.js'
import {liveRoute} from './target.js'

function large(box: Box | undefined): boolean {
  if (box === undefined) return false
  return box.w >= TOLERANCES.unmatchedMinimum && box.h >= TOLERANCES.unmatchedMinimum
}

function aboveCount(report: DiffReport): number {
  const components = report.components.filter((component) => component.deltas.length > 0).length
  const regions = report.unmatched.filter((region) => large(region.target ?? region.live)).length
  return components + regions
}

function runTime(report: DiffReport): number | null {
  const at = Number(basename(report.livePath).split('-')[1])
  return Number.isFinite(at) ? at : null
}

export const statusStep: ServerStep<StatusInput, StatusReport> = async (input, ctx, _request, page) => {
  const route = input.route ?? (await liveRoute(page))
  const records = await ctx.design.store.list({route})
  const targets = await Promise.all(
    records.map(async (record) => {
      const report = await ctx.design.store.lastResult(record.id)
      if (report === null) return {id: record.id, width: record.width, mismatch: null, above: 0, lastAt: null}
      return {
        id: record.id,
        width: record.width,
        mismatch: report.mismatch,
        above: aboveCount(report),
        lastAt: runTime(report),
      }
    }),
  )
  const done = targets.length > 0 && targets.every((target) => target.lastAt !== null && target.above === 0)
  return {route, targets, done}
}
