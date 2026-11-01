export const ROLES = ['placeholder', 'data', 'unknown'] as const
export type Role = (typeof ROLES)[number]

const LIVE_ROLES = ['literal', 'expression', 'mixed'] as const
export type LiveRole = (typeof LIVE_ROLES)[number]

export type TextVerdict = 'text' | 'sample-data' | null

export function textDelta(input: {live: LiveRole; target: Role; equal: boolean}): TextVerdict {
  const {live, target, equal} = input
  switch (live) {
    case 'expression':
      return null
    case 'mixed':
      return target === 'unknown' && !equal ? 'text' : null
    case 'literal':
      if (equal) return target === 'unknown' ? null : 'sample-data'
      return target === 'placeholder' ? null : 'text'
  }
}
