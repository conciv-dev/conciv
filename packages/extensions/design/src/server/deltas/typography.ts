import type {DeltaKind, LiveStyles} from '../../shared/types.js'

const SIZE_TOLERANCE = 0.5

function typographyKind(input: {kind: 'fontSize' | 'lineHeight' | 'fontWeight'; tolerance: number}): DeltaKind {
  const {kind, tolerance} = input
  const key: keyof LiveStyles = kind
  return {
    kind,
    measure: ({live, target}) => {
      const a = live.styles[key]
      const b = target.styles[key]
      if (typeof a !== 'number' || typeof b !== 'number' || Math.abs(a - b) <= tolerance) return []
      return [{kind, live: a, target: b}]
    },
  }
}

export const fontSize = typographyKind({kind: 'fontSize', tolerance: SIZE_TOLERANCE})
export const lineHeight = typographyKind({kind: 'lineHeight', tolerance: SIZE_TOLERANCE})
export const fontWeight = typographyKind({kind: 'fontWeight', tolerance: 0})
