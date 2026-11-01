import {memoize} from 'es-toolkit'
import {TOLERANCES} from '../../shared/tolerances.js'
import type {Box, ColorMetric, DeltaKind, Raster} from '../../shared/types.js'
import {boxMask, crop, edgeMap, medianColor, pixelHex} from '../raster.js'

const OPAQUE_HEX_LENGTH = 7

export function isOpaqueHex(color: string): boolean {
  return color.startsWith('#') && color.length === OPAQUE_HEX_LENGTH
}

export function glyphCoreColor(input: {
  raster: Raster
  box: Box
  glyphs: Box[]
  background: string
  color: ColorMetric
}): string | null {
  const {raster, box, glyphs, background, color} = input
  const tile = crop({raster, box})
  const inGlyph = boxMask({boxes: glyphs, area: tile.box})
  const distance = memoize((hex: string) => color.distance({a: hex, b: background}))
  const distances = Array.from(inGlyph, (inside, index) =>
    inside === 1 ? distance(pixelHex({raster: tile.raster, index})) : 0,
  )
  const peak = distances.reduce((highest, value) => Math.max(highest, value), 0)
  if (peak <= TOLERANCES.colorDeltaE) return null
  const core = Uint8Array.from(distances, (value) => (value >= peak - TOLERANCES.colorDeltaE ? 1 : 0))
  return medianColor({raster: tile.raster, exclude: core.map((value) => 1 - value)})
}

export function sampledFills(input: {raster: Raster; box: Box; glyphs: Box[]; color: ColorMetric}): {
  background: string
  foreground: string | null
} {
  const {raster, box, glyphs, color} = input
  const tile = crop({raster, box}).raster
  const background = medianColor({raster: tile, exclude: edgeMap(tile)})
  return {background, foreground: glyphCoreColor({raster, box, glyphs, background, color})}
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

export const background = colorKind({kind: 'background', tolerance: TOLERANCES.declaredColorDeltaE})
export const foreground = colorKind({kind: 'foreground', tolerance: TOLERANCES.colorDeltaE})
