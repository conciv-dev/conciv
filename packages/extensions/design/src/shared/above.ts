import type {ComponentReport, DiffReport} from './defs.js'
import {TOLERANCES} from './tolerances.js'

export function componentAboveTolerance(component: Pick<ComponentReport, 'deltas' | 'mismatch'>): boolean {
  return component.deltas.length > 0 || component.mismatch >= TOLERANCES.tileGate
}

export function aboveTolerance(report: Pick<DiffReport, 'components' | 'unmatched'>): number {
  return report.components.filter(componentAboveTolerance).length + report.unmatched.length
}
