export type HeroEngravingVariant = 'rings' | 'rosette' | 'contours'

export const HERO_ENGRAVING_WIDTH = 1200
export const HERO_ENGRAVING_HEIGHT = 700

const CENTER_X = HERO_ENGRAVING_WIDTH / 2
const CENTER_Y = HERO_ENGRAVING_HEIGHT / 2
const TAU = Math.PI * 2

type Point = {x: number; y: number}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function indexes(count: number): number[] {
  return Array.from({length: count}, (_, index) => index)
}

function lerpPoint(from: Point, to: Point, amount: number): Point {
  return {x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount}
}

function formatPoint(point: Point): string {
  return `${round(point.x)} ${round(point.y)}`
}

function polylinePath(points: Point[]): string {
  const [first, ...rest] = points
  if (!first) return ''
  return `M${formatPoint(first)}${rest.map((point) => `L${formatPoint(point)}`).join('')}`
}

function roundedPolygonPath(points: Point[], rounding: number): string {
  const count = points.length
  const corners = points.map((point, index) => {
    const previous = points[(index + count - 1) % count] ?? point
    const next = points[(index + 1) % count] ?? point
    return {corner: point, entry: lerpPoint(point, previous, rounding), exit: lerpPoint(point, next, rounding)}
  })
  const start = corners[0]
  if (!start) return ''
  const body = indexes(count)
    .map((index) => {
      const target = corners[(index + 1) % count]
      if (!target) return ''
      return `L${formatPoint(target.entry)}Q${formatPoint(target.corner)} ${formatPoint(target.exit)}`
    })
    .join('')
  return `M${formatPoint(start.exit)}${body}Z`
}

const RINGS_SEED = 20260817
const RINGS_COUNT = 18
const RINGS_SIDES = 5
const RINGS_BASE_RADIUS = 46
const RINGS_GROWTH = 1.168
const RINGS_ROTATION_STEP = 0.21
const RINGS_ROTATION_JITTER = 0.13
const RINGS_VERTEX_JITTER = 0.04
const RINGS_CORNER_ROUNDING = 0.12
const RINGS_SCALE_X = 1.3
const RINGS_SCALE_Y = 0.82

function buildRings(): string[] {
  const random = createRandom(RINGS_SEED)
  return indexes(RINGS_COUNT).map((ring) => {
    const radius = RINGS_BASE_RADIUS * RINGS_GROWTH ** ring
    const rotation = ring * RINGS_ROTATION_STEP + (random() - 0.5) * RINGS_ROTATION_JITTER
    const points = indexes(RINGS_SIDES).map((vertex) => {
      const angle = rotation + (vertex / RINGS_SIDES) * TAU
      const wobbled = radius * (1 + (random() - 0.5) * RINGS_VERTEX_JITTER * 2)
      return {
        x: CENTER_X + Math.cos(angle) * wobbled * RINGS_SCALE_X,
        y: CENTER_Y + Math.sin(angle) * wobbled * RINGS_SCALE_Y,
      }
    })
    return roundedPolygonPath(points, RINGS_CORNER_ROUNDING)
  })
}

const ROSETTE_SCALE_X = 1.18
const ROSETTE_SCALE_Y = 0.78
const ROSETTE_SAMPLES_PER_PETAL = 9
const ROSETTE_BANDS = [
  {radius: 132, amplitude: 54, petals: 7, turns: 4},
  {radius: 268, amplitude: 80, petals: 11, turns: 6},
  {radius: 408, amplitude: 106, petals: 15, turns: 8},
]

function buildRosette(): string[] {
  return ROSETTE_BANDS.map((band) => {
    const samples = band.turns * band.petals * ROSETTE_SAMPLES_PER_PETAL
    const frequency = band.petals + 1 / band.turns
    const points = indexes(samples + 1).map((index) => {
      const angle = (index / samples) * TAU * band.turns
      const radius = band.radius + band.amplitude * Math.cos(frequency * angle)
      return {
        x: CENTER_X + Math.cos(angle) * radius * ROSETTE_SCALE_X,
        y: CENTER_Y + Math.sin(angle) * radius * ROSETTE_SCALE_Y,
      }
    })
    return polylinePath(points)
  })
}

const CONTOURS_SEED = 88
const CONTOURS_COLUMNS = 92
const CONTOURS_ROWS = 56
const CONTOURS_OVERSCAN = 70
const CONTOURS_FREQUENCY = 0.0044
const CONTOURS_WARP = 118
const CONTOURS_LEVELS = 11
const CONTOURS_LOWEST_LEVEL = 0.3
const CONTOURS_HIGHEST_LEVEL = 0.71

function hashNoise(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return value - Math.floor(value)
}

function smoothStep(amount: number): number {
  return amount * amount * (3 - 2 * amount)
}

function valueNoise(x: number, y: number, seed: number): number {
  const cellX = Math.floor(x)
  const cellY = Math.floor(y)
  const fadeX = smoothStep(x - cellX)
  const fadeY = smoothStep(y - cellY)
  const top =
    hashNoise(cellX, cellY, seed) + (hashNoise(cellX + 1, cellY, seed) - hashNoise(cellX, cellY, seed)) * fadeX
  const bottom =
    hashNoise(cellX, cellY + 1, seed) +
    (hashNoise(cellX + 1, cellY + 1, seed) - hashNoise(cellX, cellY + 1, seed)) * fadeX
  return top + (bottom - top) * fadeY
}

function fractalNoise(x: number, y: number, seed: number): number {
  return (
    valueNoise(x, y, seed) * 0.55 +
    valueNoise(x * 2.03, y * 2.03, seed + 11) * 0.3 +
    valueNoise(x * 4.11, y * 4.11, seed + 23) * 0.15
  )
}

function contourField(x: number, y: number): number {
  const fieldX = x * CONTOURS_FREQUENCY
  const fieldY = y * CONTOURS_FREQUENCY
  const warpX = fractalNoise(fieldX + 3.2, fieldY - 1.7, CONTOURS_SEED + 7) - 0.5
  const warpY = fractalNoise(fieldX - 2.4, fieldY + 4.1, CONTOURS_SEED + 19) - 0.5
  return fractalNoise(
    fieldX + warpX * CONTOURS_WARP * CONTOURS_FREQUENCY,
    fieldY + warpY * CONTOURS_WARP * CONTOURS_FREQUENCY,
    CONTOURS_SEED,
  )
}

type Sample = {point: Point; value: number}

function crossingPoint(from: Sample, to: Sample, level: number): Point | null {
  if (from.value < level === to.value < level) return null
  return lerpPoint(from.point, to.point, (level - from.value) / (to.value - from.value))
}

function cellPath(corners: Sample[], level: number): string {
  const hits = corners.flatMap((corner, index) => {
    const next = corners[(index + 1) % corners.length]
    if (!next) return []
    const point = crossingPoint(corner, next, level)
    return point ? [point] : []
  })
  const [first, second, third, fourth] = hits
  if (!first || !second) return ''
  const head = `M${formatPoint(first)}L${formatPoint(second)}`
  if (!third || !fourth) return head
  return `${head}M${formatPoint(third)}L${formatPoint(fourth)}`
}

function contourSamples(): Sample[][] {
  const stepX = (HERO_ENGRAVING_WIDTH + CONTOURS_OVERSCAN * 2) / CONTOURS_COLUMNS
  const stepY = (HERO_ENGRAVING_HEIGHT + CONTOURS_OVERSCAN * 2) / CONTOURS_ROWS
  return indexes(CONTOURS_ROWS + 1).map((row) =>
    indexes(CONTOURS_COLUMNS + 1).map((column) => {
      const point = {x: -CONTOURS_OVERSCAN + column * stepX, y: -CONTOURS_OVERSCAN + row * stepY}
      return {point, value: contourField(point.x, point.y)}
    }),
  )
}

function levelPath(samples: Sample[][], level: number): string {
  const cells = samples.flatMap((row, rowIndex) => {
    const nextRow = samples[rowIndex + 1]
    if (!nextRow) return []
    return row.flatMap((topLeft, columnIndex) => {
      const topRight = row[columnIndex + 1]
      const bottomRight = nextRow[columnIndex + 1]
      const bottomLeft = nextRow[columnIndex]
      if (!topRight || !bottomRight || !bottomLeft) return []
      return [cellPath([topLeft, topRight, bottomRight, bottomLeft], level)]
    })
  })
  return cells.join('')
}

function buildContours(): string[] {
  const samples = contourSamples()
  const span = (CONTOURS_HIGHEST_LEVEL - CONTOURS_LOWEST_LEVEL) / (CONTOURS_LEVELS - 1)
  return indexes(CONTOURS_LEVELS)
    .map((index) => levelPath(samples, CONTOURS_LOWEST_LEVEL + index * span))
    .filter((path) => path.length > 0)
}

const HERO_ENGRAVING_BUILDERS: Record<HeroEngravingVariant, () => string[]> = {
  rings: buildRings,
  rosette: buildRosette,
  contours: buildContours,
}

export function buildHeroEngravingPaths(variant: HeroEngravingVariant): string[] {
  return HERO_ENGRAVING_BUILDERS[variant]()
}
