import {basename} from 'node:path'
import {aboveTolerance} from '../../shared/above.js'
import {DESIGN_GUIDE, type DiffReport, type StatusReport} from '../../shared/defs.js'
import type {TargetStore} from '../../shared/types.js'

function runTime(report: DiffReport): number | null {
  const at = Number(basename(report.livePath).split('-')[1])
  return Number.isFinite(at) ? at : null
}

export async function targetStatus(input: {store: TargetStore; session: string}): Promise<StatusReport> {
  const {store} = input
  const record = await store.current({session: input.session})
  if (record === null) return {targets: [], done: false}
  const report = await store.lastResult(record.id)
  const reregister = await store.model(record.id).then(
    () => false,
    () => true,
  )
  const lastAt = report === null ? null : runTime(report)
  const above = report === null ? 0 : aboveTolerance(report)
  const done = !reregister && lastAt !== null && above === 0
  return {
    ...(record.route === undefined ? {} : {route: record.route}),
    targets: [{id: record.id, width: record.width, mismatch: report?.mismatch ?? null, above, lastAt}],
    done,
    ...(done ? {} : {next: DESIGN_GUIDE}),
    ...(reregister ? {reregister} : {}),
  }
}
