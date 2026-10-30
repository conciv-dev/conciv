import type {DiffReport} from './defs.js'

export function aboveTolerance(report: Pick<DiffReport, 'components' | 'unmatched'>): number {
  return report.components.filter((component) => component.deltas.length > 0).length + report.unmatched.length
}
