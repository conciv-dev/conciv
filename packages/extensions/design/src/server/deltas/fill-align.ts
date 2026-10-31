import {TOLERANCES} from '../../shared/tolerances.js'
import type {DeltaKind, Side} from '../../shared/types.js'
import {measureInsets} from './insets.js'

const FILL_PRECISION = 1000

function measureFill(side: Side): number | null {
  if (side.parent === null || side.parent.w <= 0) return null
  return Math.round((side.box.w / side.parent.w) * FILL_PRECISION) / FILL_PRECISION
}

export const fill: DeltaKind = {
  kind: 'fill',
  measure: ({live, target}) => {
    const a = measureFill(live)
    const b = measureFill(target)
    if (a === null || b === null) return []
    if (Math.abs(a - b) <= TOLERANCES.fillDifference * Math.max(a, b)) return []
    return [{kind: 'fill', live: a, target: b}]
  },
}

function classifyAlign(side: Side): string | null {
  const insets = measureInsets(side)
  if (insets === null) return null
  const near = (value: number): boolean => Math.abs(value) <= TOLERANCES.geometryPx
  if (near(insets.left) && near(insets.right)) return 'stretch'
  if (near(insets.left - insets.right)) return 'center'
  if (near(insets.left)) return 'left'
  if (near(insets.right)) return 'right'
  return null
}

export const align: DeltaKind = {
  kind: 'align',
  measure: ({live, target}) => {
    const a = classifyAlign(live)
    const b = classifyAlign(target)
    if (a === null || b === null || a === b) return []
    return [{kind: 'align', live: a, target: b}]
  },
}
