export type HeroGridGeometry = {
  cell: number
  coverage: number
  overshoot: number
  seed: number
  quietCenterY: number
  quietRadiusX: number
  quietRadiusY: number
}

export type HeroGridPath = {opacity: number; width: number; d: string}

export type HeroGridFigure = {grid: HeroGridPath[]; ticks: HeroGridPath[]}

export const HERO_GRID_GEOMETRY: HeroGridGeometry = {
  cell: 16,
  coverage: 0.7,
  overshoot: 0.5,
  seed: 16,
  quietCenterY: 240,
  quietRadiusX: 446,
  quietRadiusY: 216,
}

export const HERO_GRID_WIDTH = 1344
export const HERO_GRID_HEIGHT = 640

const RULE_LEFT_X = 112.5
const RULE_RIGHT_X = 1231.5
const ROW_PHASE_Y = -0.5
const GRID_STROKE_WIDTH = 0.6
const FIELD_BIAS = 0.15
const FIELD_SOFTNESS = 0.3
const FIELD_CUTOFF = 0.02
const NOISE_CELLS = 7
const NOISE_LATTICE_X = 374761393
const NOISE_LATTICE_Y = 668265263
const QUIET_FLOOR = 0.06
const QUIET_INNER = 0.75
const QUIET_RAMP = 0.75
const TICK_PERIOD_ROWS = 10
const TICK_BASE_LENGTH = 0.35
const TICK_LENGTH_GAIN = 2
const TICK_LENGTH_JITTER_BASE = 0.75
const TICK_LENGTH_JITTER_SPAN = 0.5
const TICK_BASE_WIDTH = 0.5
const TICK_WIDTH_SPAN = 1
const TICK_BASE_OPACITY = 0.3
const TICK_ENVELOPE_OPACITY = 0.5
const TICK_OPACITY_JITTER = 0.2
const TICK_SEED_MIX = 2654435761
const OPACITY_STEPS = 40
const MAX_OPACITY = 1

function createRandom(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = ((value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value) >>> 0
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function latticeValue(latticeX: number, latticeY: number, seed: number): number {
  return createRandom(Math.imul(latticeX, NOISE_LATTICE_X) ^ Math.imul(latticeY, NOISE_LATTICE_Y) ^ seed)()
}

function smoothStep(amount: number): number {
  return amount * amount * (3 - 2 * amount)
}

function createNoise(seed: number, scale: number): (x: number, y: number) => number {
  return (x, y) => {
    const gridX = x / scale
    const gridY = y / scale
    const latticeX = Math.floor(gridX)
    const latticeY = Math.floor(gridY)
    const fadeX = smoothStep(gridX - latticeX)
    const fadeY = smoothStep(gridY - latticeY)
    const topLeft = latticeValue(latticeX, latticeY, seed)
    const topRight = latticeValue(latticeX + 1, latticeY, seed)
    const bottomLeft = latticeValue(latticeX, latticeY + 1, seed)
    const bottomRight = latticeValue(latticeX + 1, latticeY + 1, seed)
    return (
      topLeft +
      (topRight - topLeft) * fadeX +
      (bottomLeft - topLeft) * fadeY +
      (topLeft - topRight - bottomLeft + bottomRight) * fadeX * fadeY
    )
  }
}

function clamp(value: number, lowest: number, highest: number): number {
  return Math.min(highest, Math.max(lowest, value))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function quietAt(x: number, y: number, geometry: HeroGridGeometry): number {
  const offsetX = (x - (RULE_LEFT_X + RULE_RIGHT_X) / 2) / geometry.quietRadiusX
  const offsetY = (y - geometry.quietCenterY) / geometry.quietRadiusY
  const distance = Math.hypot(offsetX, offsetY)
  return clamp((distance - QUIET_INNER) / QUIET_RAMP, QUIET_FLOOR, 1)
}

function rowPositions(cell: number): number[] {
  const count = Math.floor((HERO_GRID_HEIGHT - ROW_PHASE_Y) / cell)
  return Array.from({length: count + 1}, (_, index) => ROW_PHASE_Y + index * cell)
}

function createBuckets(): {
  put: (opacity: number, width: number, segment: string) => void
  paths: () => HeroGridPath[]
} {
  const buckets = new Map<string, {opacity: number; width: number; segments: string[]}>()
  return {
    put: (opacity, width, segment) => {
      const bucketOpacity = Math.round(Math.min(opacity, MAX_OPACITY) * OPACITY_STEPS) / OPACITY_STEPS
      const bucketWidth = Math.round(width * 10) / 10
      const key = `${bucketOpacity}|${bucketWidth}`
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.segments.push(segment)
        return
      }
      buckets.set(key, {opacity: bucketOpacity, width: bucketWidth, segments: [segment]})
    },
    paths: () =>
      [...buckets.values()]
        .filter((bucket) => bucket.opacity > 0)
        .map((bucket) => ({opacity: bucket.opacity, width: bucket.width, d: bucket.segments.join('')})),
  }
}

function buildGrid(geometry: HeroGridGeometry, rows: number[]): HeroGridPath[] {
  const buckets = createBuckets()
  const noise = createNoise(geometry.seed, geometry.cell * NOISE_CELLS)
  const columns = Math.max(1, Math.round((RULE_RIGHT_X - RULE_LEFT_X) / geometry.cell))
  const columnStep = (RULE_RIGHT_X - RULE_LEFT_X) / columns
  for (let column = 0; column <= columns; column++) {
    const x = RULE_LEFT_X + column * columnStep
    for (const y of rows) {
      const opacity =
        clamp((geometry.coverage + FIELD_BIAS - noise(x, y)) / FIELD_SOFTNESS, 0, 1) * quietAt(x, y, geometry)
      if (opacity <= FIELD_CUTOFF) continue
      if (y + geometry.cell <= HERO_GRID_HEIGHT) {
        buckets.put(opacity, GRID_STROKE_WIDTH, `M${round(x)} ${round(y)}V${round(y + geometry.cell)}`)
      }
      if (column < columns) {
        buckets.put(opacity, GRID_STROKE_WIDTH, `M${round(x)} ${round(y)}H${round(x + columnStep)}`)
      }
    }
  }
  return buckets.paths()
}

function buildTicks(geometry: HeroGridGeometry, rows: number[]): HeroGridPath[] {
  const buckets = createBuckets()
  const random = createRandom(geometry.seed * TICK_SEED_MIX)
  for (const rule of [
    {x: RULE_LEFT_X, direction: -1},
    {x: RULE_RIGHT_X, direction: 1},
  ]) {
    const phase = random() * TICK_PERIOD_ROWS
    rows.forEach((y, index) => {
      const cycle = ((index + 1 + phase) % TICK_PERIOD_ROWS) / TICK_PERIOD_ROWS
      const envelope = 1 - Math.abs(2 * cycle - 1)
      const length =
        geometry.cell *
        (TICK_BASE_LENGTH +
          envelope *
            geometry.overshoot *
            TICK_LENGTH_GAIN *
            (TICK_LENGTH_JITTER_BASE + random() * TICK_LENGTH_JITTER_SPAN))
      const width = TICK_BASE_WIDTH + random() * TICK_WIDTH_SPAN
      const opacity = TICK_BASE_OPACITY + envelope * TICK_ENVELOPE_OPACITY + random() * TICK_OPACITY_JITTER
      buckets.put(opacity, width, `M${rule.x} ${round(y)}H${round(rule.x + rule.direction * length)}`)
    })
  }
  return buckets.paths()
}

export function buildHeroGridFigure(geometry: HeroGridGeometry): HeroGridFigure {
  const rows = rowPositions(geometry.cell)
  return {grid: buildGrid(geometry, rows), ticks: buildTicks(geometry, rows)}
}
