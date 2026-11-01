import {TOLERANCES} from '../../shared/tolerances.js'
import type {Box, DeltaKind, Side} from '../../shared/types.js'

export type Insets = {left: number; right: number; top: number; bottom: number}

export function measureInsets(side: Side): Insets | null {
  const {box, textBox} = side
  if (textBox === null) return null
  return {
    left: Math.round(textBox.x - box.x),
    right: Math.round(box.x + box.w - (textBox.x + textBox.w)),
    top: Math.round(textBox.y - box.y),
    bottom: Math.round(box.y + box.h - (textBox.y + textBox.h)),
  }
}

export function differs(input: {live: number; target: number}): boolean {
  return Math.abs(input.live - input.target) > TOLERANCES.geometryPx
}

function insetKind(edge: keyof Insets): DeltaKind {
  const kind = `inset-${edge}` as const
  return {
    kind,
    measure: ({live, target}) => {
      const a = measureInsets(live)
      const b = measureInsets(target)
      if (a === null || b === null || !differs({live: a[edge], target: b[edge]})) return []
      return [{kind, live: a[edge], target: b[edge]}]
    },
  }
}

export function right(box: Box): number {
  return box.x + box.w
}

export function bottom(box: Box): number {
  return box.y + box.h
}

export const insetLeft = insetKind('left')
export const insetRight = insetKind('right')
export const insetTop = insetKind('top')
export const insetBottom = insetKind('bottom')
