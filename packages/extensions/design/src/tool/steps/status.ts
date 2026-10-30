import {basename} from 'node:path'
import {aboveTolerance} from '../../shared/above.js'
import type {DiffReport, StatusInput, StatusReport} from '../../shared/defs.js'
import type {ServerStep} from '../../shared/types.js'
import {liveRoute} from './target.js'

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
        above: aboveTolerance(report),
        lastAt: runTime(report),
      }
    }),
  )
  const done = targets.length > 0 && targets.every((target) => target.lastAt !== null && target.above === 0)
  return {route, targets, done}
}
