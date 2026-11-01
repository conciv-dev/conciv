import type {DeltaKind} from '../../shared/types.js'
import {insetDiffers} from './insets.js'

export const radius: DeltaKind = {
  kind: 'radius',
  measure: ({live, target}) => {
    const a = live.styles.radius
    const b = target.styles.radius
    if (a === undefined || b === undefined || !insetDiffers({live: a, target: b})) return []
    return [{kind: 'radius', live: a, target: b}]
  },
}
