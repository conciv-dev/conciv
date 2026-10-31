import {basename} from 'node:path'
import type {ServerToolPageAccess} from '@conciv/extension/registry'
import {aboveTolerance} from '../../shared/above.js'
import type {DiffReport, StatusInput, StatusReport} from '../../shared/defs.js'
import type {DesignRuntime, ServerStep, TargetRecord} from '../../shared/types.js'
import {liveRoute} from './target.js'

function runTime(report: DiffReport): number | null {
  const at = Number(basename(report.livePath).split('-')[1])
  return Number.isFinite(at) ? at : null
}

async function listed(input: {query: StatusInput; design: DesignRuntime; page: ServerToolPageAccess}): Promise<{
  route: string
  records: TargetRecord[]
}> {
  const {query, design, page} = input
  if (query.route !== undefined) return {route: query.route, records: await design.store.list({route: query.route})}
  const live = await liveRoute(page)
  const records = await design.store.list({route: live})
  if (records.length > 0) return {route: live, records}
  const pathname = live.split('?')[0] ?? live
  return {route: pathname, records: await design.store.list({route: pathname})}
}

export const statusStep: ServerStep<StatusInput, StatusReport> = async (input, ctx, _request, page) => {
  const {route, records} = await listed({query: input, design: ctx.design, page})
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
