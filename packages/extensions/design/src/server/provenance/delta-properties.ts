import type {DeltaKindName} from '../../shared/defs.js'
import type {Delta, LiveComponent} from '../../shared/types.js'

type Candidates = (input: {delta: Delta; axis: LiveComponent['axis']}) => string[]

const ALIGNMENT = ['justify-content', 'align-items']

export const PARENT_PROPERTIES: readonly string[] = ['gap']

function inset(side: 'left' | 'right' | 'top' | 'bottom'): Candidates {
  const size = side === 'top' || side === 'bottom' ? ['min-height', 'height'] : ['min-width', 'width']
  return () => [`padding-${side}`, ...size, ...ALIGNMENT]
}

function gap(before: boolean): Candidates {
  return ({axis}) => {
    const row = before ? 'margin-left' : 'margin-right'
    const column = before ? 'margin-top' : 'margin-bottom'
    return ['gap', axis === 'row' ? row : column]
  }
}

export const DELTA_PROPERTIES = {
  'inset-left': inset('left'),
  'inset-right': inset('right'),
  'inset-top': inset('top'),
  'inset-bottom': inset('bottom'),
  'gap-before': gap(true),
  'gap-after': gap(false),
  fill: () => ['flex', 'width', 'max-width'],
  align: () => [...ALIGNMENT, 'margin'],
  padding: ({delta}) => (delta.side === 'y' ? ['padding-top', 'padding-bottom'] : ['padding-left', 'padding-right']),
  fontSize: () => ['font-size'],
  lineHeight: () => ['line-height'],
  fontWeight: () => ['font-weight'],
  background: () => ['background-color'],
  foreground: () => ['color'],
  radius: () => ['border-radius'],
} as const satisfies Record<DeltaKindName, Candidates>
