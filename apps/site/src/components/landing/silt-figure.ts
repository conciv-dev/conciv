export type SiltFigure = {
  width: number
  height: number
  scale: number
  seed: number
  tint: string
  alphaScale: number
}

export const SILT_SETTLE_STEPS = 20

const PARTICLES_PER_PIXEL = 0.005
const MAX_PARTICLES = 5000
const PARTICLE_SIZE = 2
const DRIFT_SPEED = 0.6
const STEP_SPEED = 2.2
const TIME_STEP = 0.0006
const FLOW_TIME_GAIN = 10
const NOISE_SCALE = 0.003
const TRAIL_FADE = 0.035
const VELOCITY_BASE = 0.3
const VELOCITY_SPAN = 0.7
const ALPHA_LEVELS = [0.03, 0.045, 0.06, 0.09, 0.18, 0.27]
const SPARKLE_LEVELS = 2
const SPARKLE_SHARE = 0.05
const FULL_TURN = Math.PI * 2
const LATTICE_SIZE = 256
const LATTICE_MASK = 255
const GRADIENT_MASK = 7
const GRADIENT_X = new Float32Array([1, -1, 1, -1, 1, -1, 0, 0])
const GRADIENT_Y = new Float32Array([1, 1, -1, -1, 0, 0, 1, -1])
const LCG_MULTIPLIER = 16807
const LCG_MODULUS = 2147483647

type SiltBand = {fill: string; start: number; end: number}

function readNumber(values: Float32Array | Uint8Array, index: number): number {
  return values[index] ?? 0
}

function wrap(value: number, span: number): number {
  return ((value % span) + span) % span
}

function createLinearRandom(seed: number): () => number {
  let state = Math.abs(Math.trunc(seed)) % LCG_MODULUS
  if (state === 0) state = 1
  return () => {
    state = (state * LCG_MULTIPLIER) % LCG_MODULUS
    return (state - 1) / (LCG_MODULUS - 1)
  }
}

function createPermutation(random: () => number): Uint8Array {
  const source = new Uint8Array(LATTICE_SIZE)
  for (let index = 0; index < LATTICE_SIZE; index++) source[index] = index
  for (let index = LATTICE_SIZE - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    const held = readNumber(source, index)
    source[index] = readNumber(source, swap)
    source[swap] = held
  }
  const table = new Uint8Array(LATTICE_SIZE * 2)
  for (let index = 0; index < table.length; index++) table[index] = readNumber(source, index & LATTICE_MASK)
  return table
}

function fade(amount: number): number {
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10)
}

function createGradientNoise(table: Uint8Array): (x: number, y: number) => number {
  return (x, y) => {
    const cellX = Math.floor(x)
    const cellY = Math.floor(y)
    const fractionX = x - cellX
    const fractionY = y - cellY
    const wrapX = cellX & LATTICE_MASK
    const wrapY = cellY & LATTICE_MASK
    const easeX = fade(fractionX)
    const easeY = fade(fractionY)
    const cornerTopLeft = readNumber(table, readNumber(table, wrapX) + wrapY) & GRADIENT_MASK
    const cornerTopRight = readNumber(table, readNumber(table, wrapX + 1) + wrapY) & GRADIENT_MASK
    const cornerBottomLeft = readNumber(table, readNumber(table, wrapX) + wrapY + 1) & GRADIENT_MASK
    const cornerBottomRight = readNumber(table, readNumber(table, wrapX + 1) + wrapY + 1) & GRADIENT_MASK
    const dotTopLeft =
      readNumber(GRADIENT_X, cornerTopLeft) * fractionX + readNumber(GRADIENT_Y, cornerTopLeft) * fractionY
    const dotTopRight =
      readNumber(GRADIENT_X, cornerTopRight) * (fractionX - 1) + readNumber(GRADIENT_Y, cornerTopRight) * fractionY
    const dotBottomLeft =
      readNumber(GRADIENT_X, cornerBottomLeft) * fractionX + readNumber(GRADIENT_Y, cornerBottomLeft) * (fractionY - 1)
    const dotBottomRight =
      readNumber(GRADIENT_X, cornerBottomRight) * (fractionX - 1) +
      readNumber(GRADIENT_Y, cornerBottomRight) * (fractionY - 1)
    const topRow = dotTopLeft + easeX * (dotTopRight - dotTopLeft)
    const bottomRow = dotBottomLeft + easeX * (dotBottomRight - dotBottomLeft)
    return topRow + easeY * (bottomRow - topRow)
  }
}

function splitEvenly(total: number, parts: number): number[] {
  const share = Math.floor(total / parts)
  const sizes = Array.from({length: parts}, () => share)
  sizes[parts - 1] = total - share * (parts - 1)
  return sizes
}

function levelSizes(count: number): number[] {
  const sparkleTotal = Math.round(count * SPARKLE_SHARE)
  const normalLevels = ALPHA_LEVELS.length - SPARKLE_LEVELS
  return [...splitEvenly(count - sparkleTotal, normalLevels), ...splitEvenly(sparkleTotal, SPARKLE_LEVELS)]
}

function createBands(count: number, tint: string, alphaScale: number): SiltBand[] {
  const sizes = levelSizes(count)
  let start = 0
  return ALPHA_LEVELS.map((alpha, level) => {
    const size = sizes[level] ?? 0
    const band = {fill: `rgba(${tint}, ${alpha * alphaScale})`, start, end: start + size}
    start += size
    return band
  })
}

export function createSiltPainter(context: CanvasRenderingContext2D, figure: SiltFigure): (steps: number) => void {
  const {width, height, scale, seed, tint, alphaScale} = figure
  context.canvas.width = Math.round(width * scale)
  context.canvas.height = Math.round(height * scale)
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.clearRect(0, 0, width, height)

  const random = createLinearRandom(seed)
  const noise = createGradientNoise(createPermutation(random))
  const count = Math.min(MAX_PARTICLES, Math.round(width * height * PARTICLES_PER_PIXEL))
  const bands = createBands(count, tint, alphaScale)
  const positionX = new Float32Array(count)
  const positionY = new Float32Array(count)
  const velocity = new Float32Array(count)
  for (let index = 0; index < count; index++) {
    positionX[index] = random() * width
    positionY[index] = random() * height
    velocity[index] = VELOCITY_BASE + random() * VELOCITY_SPAN
  }

  let time = 0

  const fadeTrails = () => {
    context.globalCompositeOperation = 'destination-out'
    context.fillStyle = `rgba(0, 0, 0, ${TRAIL_FADE})`
    context.fillRect(0, 0, width, height)
    context.globalCompositeOperation = 'source-over'
  }

  const advect = () => {
    for (let index = 0; index < count; index++) {
      const currentX = readNumber(positionX, index)
      const currentY = readNumber(positionY, index)
      const angle = noise(currentX * NOISE_SCALE, currentY * NOISE_SCALE + time * FLOW_TIME_GAIN) * FULL_TURN
      const stride = readNumber(velocity, index) * STEP_SPEED * DRIFT_SPEED
      positionX[index] = wrap(currentX + Math.cos(angle) * stride, width)
      positionY[index] = wrap(currentY + Math.sin(angle) * stride, height)
    }
  }

  const stamp = () => {
    for (const band of bands) {
      context.fillStyle = band.fill
      for (let index = band.start; index < band.end; index++) {
        context.fillRect(readNumber(positionX, index), readNumber(positionY, index), PARTICLE_SIZE, PARTICLE_SIZE)
      }
    }
  }

  return (steps) => {
    for (let pass = 0; pass < steps; pass++) {
      time += TIME_STEP * DRIFT_SPEED
      fadeTrails()
      advect()
      stamp()
    }
  }
}
