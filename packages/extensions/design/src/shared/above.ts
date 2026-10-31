import type {DiffReport} from './defs.js'
import {TOLERANCES} from './tolerances.js'

export function aboveTolerance(report: Pick<DiffReport, 'components' | 'unmatched'>): number {
  const differing = report.components.filter(
    (component) => component.deltas.length > 0 || component.mismatch >= TOLERANCES.tileGate,
  )
  return differing.length + report.unmatched.length
}
