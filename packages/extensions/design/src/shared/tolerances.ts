import {z} from 'zod'
import type {ComponentReport, DiffReport} from './defs.js'

export const TOLERANCES = {
  geometryPx: 2,
  colorDeltaE: 3,
  declaredColorDeltaE: 1,
  tileGate: 0.005,
  unmatchedMinimum: 24,
  tileMargin: 8,
  interiorInset: 4,
  blurRadius: 1,
  glyphHalo: 1,
  inkTrimThreshold: 40,
  fillDifference: 0.05,
  depth: 3,
  limit: 12,
  runsKept: 20,
  captureFrameMs: 500,
  measureTimeoutMs: 60_000,
  typeSearchMin: 8,
  typeSearchMax: 56,
  boldCoverage: 1.2,
  regularCoverage: 1.07,
  ratioConfidence: 0.5,
  typeHalo: 4,
  inlineWidthConfidence: 0.5,
  segmentDistance: 10,
  segmentImageShare: 0.3,
  ocrConfidenceFloor: 0.6,
  ocrUpsampleBelowPx: 16,
  ocrTileHeight: 1600,
  ocrTileOverlap: 64,
} as const

export const LIBRARY_SHEET_MARKER = '/node_modules/'

export const designConfig = z.object({
  comparator: z.enum(['blazediff', 'pixelmatch']).default('blazediff'),
  geometry: z.enum(['edge-projection']).default('edge-projection'),
  color: z.enum(['ciede2000']).default('ciede2000'),
  matcher: z.enum(['tile']).default('tile'),
  text: z.enum(['paddle']).default('paddle'),
  segmenter: z.enum(['threshold']).default('threshold'),
  roles: z.enum(['rules']).default('rules'),
})

export type DesignConfig = z.output<typeof designConfig>

export const SOURCE_ATTR = 'data-conciv-source'

const SIDES = [
  ['left', 'inline-start'],
  ['right', 'inline-end'],
  ['top', 'block-start'],
  ['bottom', 'block-end'],
] as const

const BOXES = ['padding', 'margin', 'border'] as const

function swapSide(input: {property: string; from: string; to: string}): string | null {
  const {property, from, to} = input
  if (property === from) return `inset-${to}`
  if (property === `inset-${from}`) return to
  const box = BOXES.find((name) => property === `${name}-${from}` || property.startsWith(`${name}-${from}-`))
  if (box === undefined) return null
  return `${box}-${to}${property.slice(`${box}-${from}`.length)}`
}

export function propertyAliases(property: string): string[] {
  const swapped = SIDES.flatMap(([physical, logical]) => [
    swapSide({property, from: physical, to: logical}),
    swapSide({property, from: logical, to: physical}),
  ])
  return [property, ...swapped.filter((alias) => alias !== null)]
}

export function declares(input: {declared: string; property: string}): boolean {
  return propertyAliases(input.property).some(
    (alias) => alias === input.declared || alias.startsWith(`${input.declared}-`),
  )
}

export function componentAboveTolerance(component: Pick<ComponentReport, 'deltas' | 'mismatch'>): boolean {
  return component.deltas.length > 0 || component.mismatch >= TOLERANCES.tileGate
}

export function aboveTolerance(report: Pick<DiffReport, 'components' | 'unmatched'>): number {
  return report.components.filter(componentAboveTolerance).length + report.unmatched.length
}
