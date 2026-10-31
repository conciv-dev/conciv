import type {Box, DeltaKind, Side} from '../../shared/types.js'
import {bottom, differs, right} from './insets.js'

function gapBetween(input: {first: Box; second: Box; axis: 'row' | 'column'}): number {
  const {first, second, axis} = input
  return Math.round(axis === 'row' ? second.x - right(first) : second.y - bottom(first))
}

function measureGap(input: {side: Side; before: boolean}): number | null {
  const {side, before} = input
  if (side.axis === null) return null
  const other = before ? side.prev : side.next
  if (other === null) return null
  if (before) return gapBetween({first: other, second: side.box, axis: side.axis})
  return gapBetween({first: side.box, second: other, axis: side.axis})
}

function gapKind(before: boolean): DeltaKind {
  const kind = before ? 'gap-before' : 'gap-after'
  return {
    kind,
    measure: ({live, target}) => {
      const a = measureGap({side: live, before})
      const b = measureGap({side: target, before})
      if (a === null || b === null || !differs({live: a, target: b})) return []
      return [{kind, live: a, target: b}]
    },
  }
}

export const gapBefore = gapKind(true)
export const gapAfter = gapKind(false)
