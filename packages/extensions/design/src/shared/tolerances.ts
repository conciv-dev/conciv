import {differenceCiede2000, parse} from 'culori'
import {z} from 'zod'

type Rgb = [number, number, number]

export const designConfig = Object.assign(
  z.object({
    comparator: z.enum(['blazediff', 'pixelmatch']).default('blazediff'),
    color: z.enum(['ciede2000']).default('ciede2000'),
    pairer: z.enum(['vote']).default('vote'),
    ranker: z.enum(['impact']).default('impact'),
    text: z.enum(['paddle']).default('paddle'),
    segmenter: z.enum(['threshold']).default('threshold'),
    roles: z.enum(['rules']).default('rules'),
    blind: z.boolean().default(false),
  }),
  {
    tolerances: {
      geometryPx: 2,
      slightShiftPx: 12,
      colorDeltaE: 3,
      declaredColorDeltaE: 1,
      tileGate: 0.005,
      pixelGate: 0.5,
      unmatchedMinimum: 24,
      tileMargin: 8,
      tileSide: 64,
      similarityTile: 64,
      interiorInset: 4,
      blurRadius: 1,
      glyphHalo: 1,
      inkTrimThreshold: 40,
      depth: 3,
      limit: 12,
      runsKept: 20,
      captureFrameMs: 500,
      freezeFrames: 2,
      measureTimeoutMs: 60_000,
      renderChunk: 24,
      typeSearchMin: 8,
      typeSearchMax: 56,
      boldCoverage: 1.2,
      regularCoverage: 1.07,
      ratioConfidence: 0.5,
      typeHalo: 4,
      capRatio: 0.82,
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
      briefNext: 2,
      residualAreaGate: 0.01,
      runDebounceMs: 150,
      settleQuiet: 800,
      measureChunk: 200,
      pairBudgetMs: 20_000,
      pairBoxIou: 0.3,
      pairExactIou: 0.9,
      pairBoxArea: 3,
      pairMargin: 0.08,
      pairDominance: 0.15,
      pairFloor: 0.3,
      pairFloorMargin: 0.1,
      pairMinWeight: 0.1,
      takumiP95: {wide: 1.7, narrow: 7.4},
      takumiNarrowBelow: 1000,
      opinionBudgetMs: 2000,
      layoutTolerance: 4,
      paintedShare: 0.1,
      paintedCount: 3,
      ordinalLimit: 9,
      iconSide: 24,
      iconTextFloor: 0.8,
      iconSlotSide: 48,
      glyphNoise: 12,
      sectionGap: 64,
      regionGap: 32,
      widgetWait: 8000,
      widgetPoll: 250,
      figmaPair: {
        overlapFloor: 0.05,
        nearCenterPx: 60,
        overlapWeight: 0.45,
        textWeight: 0.4,
        textlessPenalty: 0.15,
        leafShapeBonus: 0.05,
        imageBonus: 0.1,
        parentBonus: 0.15,
        elementKindWeight: 0.1,
        nameWeight: 0.1,
        layoutRoleWeight: 0.1,
        threshold: 0.3,
        candidatesKept: 3,
      },
    },
    attributes: {
      source: 'data-conciv-source',
      placeholder: 'data-conciv-placeholder',
      pane: 'data-conciv-design-pane',
    },
    propertyAliases,
    folded,
    hex,
    rgbDistance,
    colorMetrics: {ciede2000},
  } as const,
)

function propertyAliases(property: string): string[] {
  const swapped = SIDES.flatMap(([physical, logical]) => [
    swapSide({property, from: physical, to: logical}),
    swapSide({property, from: logical, to: physical}),
  ])
  return [property, ...swapped.filter((alias) => alias !== null)]
}

const SIDES = [
  ['left', 'inline-start'],
  ['right', 'inline-end'],
  ['top', 'block-start'],
  ['bottom', 'block-end'],
] as const

function swapSide(input: {property: string; from: string; to: string}): string | null {
  const {property, from, to} = input
  if (property === from) return `inset-${to}`
  if (property === `inset-${from}`) return to
  const box = BOXES.find((name) => property === `${name}-${from}` || property.startsWith(`${name}-${from}-`))
  if (box === undefined) return null
  return `${box}-${to}${property.slice(`${box}-${from}`.length)}`
}

const BOXES = ['padding', 'margin', 'border'] as const

function folded(text: string): string {
  return text.toLowerCase().split(' ').filter(Boolean).join(' ').trim()
}

function hex(channels: number[]): string {
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function rgbDistance(input: {a: Rgb; b: Rgb}): number {
  const {a, b} = input
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function ciede2000(input: {a: string; b: string}): number {
  const from = parse(input.a)
  const to = parse(input.b)
  if (from === undefined || to === undefined) return 0
  return difference(from, to)
}

const difference = differenceCiede2000()
