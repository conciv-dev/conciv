import {z} from 'zod'
import type {ComponentReport, DeltaKindName, DiffReport, Stage} from './defs.js'
import type {Delta, ItemKind} from './types.js'

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
  roundBudget: 8,
  stallRounds: 2,
  briefSize: 5,
  residualAreaGate: 0.01,
  runDebounceMs: 150,
  runBudgetMs: 20_000,
  pairBoxIou: 0.3,
  pairBoxArea: 3,
  pairMargin: 0.08,
  pairDominance: 0.15,
  pairFloor: 0.3,
  pairFloorMargin: 0.1,
  pairMinWeight: 0.1,
  takumiP95: {wide: 1.7, narrow: 7.4},
  takumiNarrowBelow: 1000,
  opinionBudgetMs: 2000,
} as const

export type Tolerances = typeof TOLERANCES

export const LIBRARY_SHEET_MARKER = '/node_modules/'

export const designConfig = z.object({
  comparator: z.enum(['blazediff', 'pixelmatch']).default('blazediff'),
  color: z.enum(['ciede2000']).default('ciede2000'),
  pairer: z.enum(['vote']).default('vote'),
  ranker: z.enum(['impact']).default('impact'),
  text: z.enum(['paddle']).default('paddle'),
  segmenter: z.enum(['threshold']).default('threshold'),
  roles: z.enum(['rules']).default('rules'),
})

export type DesignConfig = z.output<typeof designConfig>

export const SOURCE_ATTR = 'data-conciv-source'
export const PANE_ATTR = 'data-conciv-design-pane'

export function kindTolerance(kind: DeltaKindName): number {
  switch (kind) {
    case 'fontSize':
    case 'lineHeight':
      return FONT_TOLERANCE
    case 'fontWeight':
      return WEIGHT_STEP
    case 'columns':
      return 1
    default:
      return TOLERANCES.geometryPx
  }
}

const FONT_TOLERANCE = 0.5
const WEIGHT_STEP = 100

export function kindStage(kind: ItemKind): Stage | null {
  return KIND_STAGES[kind]
}

const KIND_STAGES = {
  unbuilt: 'structure',
  axis: 'structure',
  columns: 'structure',
  text: 'content',
  fontSize: 'content',
  lineHeight: 'content',
  fontWeight: 'content',
  offset: 'geometry',
  'inset-left': 'geometry',
  'inset-right': 'geometry',
  'inset-top': 'geometry',
  'inset-bottom': 'geometry',
  'gap-before': 'geometry',
  'gap-after': 'geometry',
  padding: 'geometry',
  align: 'geometry',
  background: 'paint',
  foreground: 'paint',
  radius: 'paint',
  border: 'paint',
  extra: null,
} as const satisfies Record<ItemKind, Stage | null>

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
  const unbuilt = report.unmatched.filter((entry) => entry.kind === 'unbuilt' && entry.stage === 'structure')
  return report.components.filter(componentAboveTolerance).length + unbuilt.length
}

export function traced(delta: Delta): boolean {
  return delta.via !== undefined && delta.via !== 'unknown' && delta.file !== undefined
}

export function deltaSentence(delta: Delta): string {
  if (delta.kind === 'text') return `change the text from ${delta.live} to ${delta.target}${at(delta)}`
  const change = `${delta.kind} is ${delta.live} where the design has ${delta.target}`
  if (!traced(delta)) return change
  const declared = delta.declaration === undefined ? '' : `, declared as \`${delta.declaration}\``
  const suggestion = delta.suggest === undefined ? '' : `; ${delta.suggest}`
  return `${change}, set via ${delta.via}${at(delta)}${declared}${suggestion}`
}

function at(delta: Delta): string {
  if (delta.file === undefined) return ''
  return delta.line === undefined ? ` at ${delta.file}` : ` at ${delta.file}:${delta.line}`
}
