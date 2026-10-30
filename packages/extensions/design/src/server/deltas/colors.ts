import {TOLERANCES} from '../../shared/tolerances.js'
import type {Box, DeltaKind, Raster} from '../../shared/types.js'
import {crop, edgeMap, foregroundColor, medianColor} from '../raster.js'

export const DECLARED_COLOR_DELTA_E = 1
const OPAQUE_HEX_LENGTH = 7

export function isOpaqueHex(color: string): boolean {
  return color.startsWith('#') && color.length === OPAQUE_HEX_LENGTH
}

export function sampledFills(input: {raster: Raster; box: Box}): {background: string; foreground: string} {
  const tile = crop({raster: input.raster, box: input.box}).raster
  const edges = edgeMap(tile)
  return {background: medianColor({raster: tile, exclude: edges}), foreground: foregroundColor({raster: tile, edges})}
}

function colorKind(input: {kind: 'background' | 'foreground'; tolerance: number}): DeltaKind {
  const {kind, tolerance} = input
  const key = kind === 'background' ? 'background' : 'color'
  return {
    kind,
    measure: ({live, target, color}) => {
      const a = live.styles[key]
      const b = target.styles[key]
      if (a === undefined || b === undefined || color.distance({a, b}) <= tolerance) return []
      return [{kind, live: a, target: b}]
    },
  }
}

export const background = colorKind({kind: 'background', tolerance: DECLARED_COLOR_DELTA_E})
export const foreground = colorKind({kind: 'foreground', tolerance: TOLERANCES.colorDeltaE})
