export type SynthRibbonFigure = {width: number; height: number}

export const SYNTH_RIBBON_TIME_STEP = 0.012

const RIBBON_COUNT = 5
const SEGMENTS = 90
const FOCAL_LENGTH = 600
const CAMERA_Z = -400
const SPINE_STRIDE = 7
const QUAD_STRIDE = 12
const DEPTH_NEAR = 10
const DEPTH_FAR = 1200
const DEPTH_BUCKETS = 256
const FULL_TURN = Math.PI * 2
const SEED = 91
const LCG_MULTIPLIER = 16807
const LCG_MODULUS = 2147483647
const HUE_STEPS = 24
const HUE_PERIOD = FULL_TURN / 0.24
const NORMAL_STEPS = 56
const FOG_STEPS = 8
const SPECULAR_STROKE = 'rgba(255, 226, 208, 0.7)'
const ACCENT_HUE_START = 2
const ACCENT_HUE_SPAN = 34
const ACCENT_SATURATION_GAIN = 1.12

type RibbonDefinition = {
  phaseX: number
  phaseY: number
  phaseZ: number
  frequencyX: number
  frequencyY: number
  frequencyZ: number
  amplitudeX: number
  amplitudeY: number
  amplitudeZ: number
  twistFrequency: number
  twistPhase: number
  hue: number
  baseWidth: number
  speed: number
  depthOffset: number
}

function readNumber(values: Float32Array, index: number): number {
  return values[index] ?? 0
}

function readSlot(values: Uint16Array, index: number): number {
  return values[index] ?? 0
}

function readCount(values: Int32Array, index: number): number {
  return values[index] ?? 0
}

function readFill(fills: readonly string[], index: number): string {
  return fills[index] ?? 'transparent'
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function createLinearRandom(seed: number): () => number {
  let state = Math.abs(Math.trunc(seed)) % LCG_MODULUS
  if (state === 0) state = 1
  return () => {
    state = (state * LCG_MULTIPLIER) % LCG_MODULUS
    return (state - 1) / (LCG_MODULUS - 1)
  }
}

function buildRibbons(): readonly RibbonDefinition[] {
  const random = createLinearRandom(SEED)
  return Array.from({length: RIBBON_COUNT}, (_, index) => ({
    phaseX: random() * FULL_TURN,
    phaseY: random() * FULL_TURN,
    phaseZ: random() * FULL_TURN,
    frequencyX: 0.25 + random() * 0.5,
    frequencyY: 0.2 + random() * 0.35,
    frequencyZ: 0.15 + random() * 0.3,
    amplitudeX: 250 + random() * 300,
    amplitudeY: 120 + random() * 200,
    amplitudeZ: 100 + random() * 200,
    twistFrequency: 1.2 + random() * 2.5,
    twistPhase: random() * FULL_TURN,
    hue: (index / RIBBON_COUNT) * FULL_TURN + random() * 0.5,
    baseWidth: 35 + random() * 50,
    speed: 0.25 + random() * 0.35,
    depthOffset: (index - RIBBON_COUNT * 0.5) * 100,
  }))
}

const RIBBONS = buildRibbons()

type ChromeLight = {red: number; green: number; blue: number}

function chromeLight(normal: number, hueShift: number, fog: number): ChromeLight {
  const specular = Math.sin(normal * Math.PI) ** 2.5
  const band = normal * 5 + hueShift * 0.3
  const pink = Math.max(0, Math.sin(band * 0.8) * 0.5 + 0.5)
  const cyan = Math.max(0, Math.sin(band * 0.8 + 2.5) * 0.5 + 0.5)
  const purple = Math.max(0, Math.sin(band * 0.8 + 4.5) * 0.5 + 0.5)
  const highlight = specular ** 3
  const rim = (1 - specular) ** 2.5 * 0.4
  const red = 0.08 + specular * (0.5 * pink + 0.3 * purple + 0.2) + highlight + rim * 0.1
  const green = 0.03 + specular * (0.6 * cyan + 0.1 * pink) + highlight * 0.4 + rim * 0.8
  const blue = 0.1 + specular * (0.5 * cyan + 0.4 * purple + 0.15) + highlight * 0.7 + rim
  return {
    red: clamp(red * (1 - fog * 0.7) + 0.02 * fog, 0, 1),
    green: clamp(green * (1 - fog * 0.6) + 0.03 * fog, 0, 1),
    blue: clamp(blue * (1 - fog * 0.4) + 0.08 * fog, 0, 1),
  }
}

function hueOfLight(light: ChromeLight, span: number, high: number): number {
  if (span === 0) return 0
  if (high === light.red) return (((light.green - light.blue) / span + 6) % 6) / 6
  if (high === light.green) return ((light.blue - light.red) / span + 2) / 6
  return ((light.red - light.green) / span + 4) / 6
}

function channelOfHue(hue: number, level: number, amount: number, offset: number): number {
  const position = (offset + hue * 12) % 12
  return clamp(level - amount * Math.max(-1, Math.min(position - 3, 9 - position, 1)), 0, 1)
}

function accentColor(light: ChromeLight): string {
  const high = Math.max(light.red, light.green, light.blue)
  const low = Math.min(light.red, light.green, light.blue)
  const span = high - low
  const level = (high + low) * 0.5
  const saturation = clamp((span === 0 ? 0 : span / (1 - Math.abs(2 * level - 1))) * ACCENT_SATURATION_GAIN, 0, 1)
  const hue = (ACCENT_HUE_START + ACCENT_HUE_SPAN * hueOfLight(light, span, high)) / 360
  const amount = saturation * Math.min(level, 1 - level)
  const red = Math.round(channelOfHue(hue, level, amount, 0) * 255)
  const green = Math.round(channelOfHue(hue, level, amount, 8) * 255)
  const blue = Math.round(channelOfHue(hue, level, amount, 4) * 255)
  return `rgb(${red}, ${green}, ${blue})`
}

function chromeColor(normal: number, hueShift: number, fog: number): string {
  return accentColor(chromeLight(normal, hueShift, fog))
}

function buildPalette(): readonly string[] {
  const fills: string[] = []
  for (let hueStep = 0; hueStep < HUE_STEPS; hueStep++) {
    for (let normalStep = 0; normalStep < NORMAL_STEPS; normalStep++) {
      for (let fogStep = 0; fogStep < FOG_STEPS; fogStep++) {
        const hueShift = (hueStep / HUE_STEPS) * HUE_PERIOD
        const normal = (normalStep + 0.5) / NORMAL_STEPS
        fills.push(chromeColor(normal, hueShift, fogStep / (FOG_STEPS - 1)))
      }
    }
  }
  return fills
}

const PALETTE = buildPalette()

function paletteIndex(normal: number, hueShift: number, depth: number): number {
  const hueStep = clamp(Math.floor(((hueShift % HUE_PERIOD) / HUE_PERIOD) * HUE_STEPS), 0, HUE_STEPS - 1)
  const normalStep = clamp(Math.floor(normal * NORMAL_STEPS), 0, NORMAL_STEPS - 1)
  const fog = clamp((depth - 200) / 800, 0, 1)
  const fogStep = clamp(Math.round(fog * (FOG_STEPS - 1)), 0, FOG_STEPS - 1)
  return (hueStep * NORMAL_STEPS + normalStep) * FOG_STEPS + fogStep
}

function fillSpine(spine: Float32Array, ribbon: RibbonDefinition, time: number) {
  const drift = time * ribbon.speed
  for (let step = 0; step <= SEGMENTS; step++) {
    const along = (step / SEGMENTS - 0.5) * 2
    const positionX = Math.sin(along * 3 * ribbon.frequencyX + ribbon.phaseX + drift * 0.7) * ribbon.amplitudeX
    const positionY = Math.sin(along * 2.5 * ribbon.frequencyY + ribbon.phaseY + drift * 0.5) * ribbon.amplitudeY
    const wave = Math.sin(along * 2 * ribbon.frequencyZ + ribbon.phaseZ + drift * 0.3) * ribbon.amplitudeZ
    const positionZ = along * 500 + ribbon.depthOffset + wave + 500
    const twist = along * ribbon.twistFrequency * 3 + drift * 2 + ribbon.twistPhase + Math.sin(along * 5 + drift) * 0.5
    const taper = Math.max(0.02, Math.cos(Math.abs(along) * Math.PI * 0.5) ** 2)
    const halfWidth = ribbon.baseWidth * taper
    const slot = step * SPINE_STRIDE
    spine[slot] = positionX
    spine[slot + 1] = positionY
    spine[slot + 2] = positionZ
    spine[slot + 3] = Math.cos(twist) * halfWidth
    spine[slot + 4] = Math.sin(twist) * halfWidth
    spine[slot + 5] = twist
    spine[slot + 6] = taper
  }
}

function projectScale(depth: number): number {
  return FOCAL_LENGTH / depth
}

function collectQuads(
  quads: Float32Array,
  spine: Float32Array,
  figure: SynthRibbonFigure,
  hueShift: number,
  written: number,
): number {
  const centerX = figure.width * 0.5
  const centerY = figure.height * 0.5
  let count = written
  for (let step = 0; step < SEGMENTS; step++) {
    const near = step * SPINE_STRIDE
    const far = near + SPINE_STRIDE
    const nearDepth = Math.max(1, readNumber(spine, near + 2) - CAMERA_Z)
    const farDepth = Math.max(1, readNumber(spine, far + 2) - CAMERA_Z)
    const depth = (nearDepth + farDepth) * 0.5
    if (depth < DEPTH_NEAR || depth > DEPTH_FAR) continue
    const nearScale = projectScale(nearDepth)
    const farScale = projectScale(farDepth)
    const nearX = readNumber(spine, near)
    const nearY = readNumber(spine, near + 1)
    const nearEdgeX = readNumber(spine, near + 3)
    const nearEdgeY = readNumber(spine, near + 4)
    const farX = readNumber(spine, far)
    const farY = readNumber(spine, far + 1)
    const farEdgeX = readNumber(spine, far + 3)
    const farEdgeY = readNumber(spine, far + 4)
    const twist = (readNumber(spine, near + 5) + readNumber(spine, far + 5)) * 0.5
    const taper = (readNumber(spine, near + 6) + readNumber(spine, far + 6)) * 0.5
    const normal = Math.sin(twist) * 0.5 + 0.5
    const depthAlpha = Math.max(0.2, 1 - (depth - 100) / 1000)
    const slot = count * QUAD_STRIDE
    quads[slot] = centerX + (nearX - nearEdgeX) * nearScale
    quads[slot + 1] = centerY + (nearY - nearEdgeY) * nearScale
    quads[slot + 2] = centerX + (nearX + nearEdgeX) * nearScale
    quads[slot + 3] = centerY + (nearY + nearEdgeY) * nearScale
    quads[slot + 4] = centerX + (farX + farEdgeX) * farScale
    quads[slot + 5] = centerY + (farY + farEdgeY) * farScale
    quads[slot + 6] = centerX + (farX - farEdgeX) * farScale
    quads[slot + 7] = centerY + (farY - farEdgeY) * farScale
    quads[slot + 8] = depth
    quads[slot + 9] = clamp(depthAlpha * (0.6 + taper * 0.4), 0.05, 1)
    quads[slot + 10] = paletteIndex(normal, hueShift, depth)
    quads[slot + 11] = normal
    count += 1
  }
  return count
}

function depthBucket(depth: number): number {
  const span = (depth - DEPTH_NEAR) / (DEPTH_FAR - DEPTH_NEAR)
  return clamp(Math.floor(span * DEPTH_BUCKETS), 0, DEPTH_BUCKETS - 1)
}

function sortByDepth(order: Uint16Array, counts: Int32Array, quads: Float32Array, count: number) {
  counts.fill(0)
  for (let index = 0; index < count; index++) {
    const bucket = depthBucket(readNumber(quads, index * QUAD_STRIDE + 8))
    counts[bucket] = readCount(counts, bucket) + 1
  }
  let running = count
  for (let bucket = 0; bucket < DEPTH_BUCKETS; bucket++) {
    running -= readCount(counts, bucket)
    counts[bucket] = running
  }
  for (let index = 0; index < count; index++) {
    const bucket = depthBucket(readNumber(quads, index * QUAD_STRIDE + 8))
    const cursor = readCount(counts, bucket)
    order[cursor] = index
    counts[bucket] = cursor + 1
  }
}

function drawQuad(context: CanvasRenderingContext2D, quads: Float32Array, slot: number) {
  context.beginPath()
  context.moveTo(readNumber(quads, slot), readNumber(quads, slot + 1))
  context.lineTo(readNumber(quads, slot + 2), readNumber(quads, slot + 3))
  context.lineTo(readNumber(quads, slot + 4), readNumber(quads, slot + 5))
  context.lineTo(readNumber(quads, slot + 6), readNumber(quads, slot + 7))
  context.closePath()
  context.fill()
}

function drawSpecular(context: CanvasRenderingContext2D, quads: Float32Array, slot: number) {
  const normal = readNumber(quads, slot + 11)
  if (normal <= 0.3 || normal >= 0.7) return
  const intensity = Math.max(0, 1 - Math.abs(normal - 0.5) * 3) ** 1.5
  if (intensity <= 0.05) return
  const depth = readNumber(quads, slot + 8)
  context.globalAlpha = intensity * readNumber(quads, slot + 9) * 0.5
  context.lineWidth = 2 * (1 - depth / DEPTH_FAR)
  context.beginPath()
  context.moveTo(
    (readNumber(quads, slot) + readNumber(quads, slot + 2)) * 0.5,
    (readNumber(quads, slot + 1) + readNumber(quads, slot + 3)) * 0.5,
  )
  context.lineTo(
    (readNumber(quads, slot + 4) + readNumber(quads, slot + 6)) * 0.5,
    (readNumber(quads, slot + 5) + readNumber(quads, slot + 7)) * 0.5,
  )
  context.stroke()
}

export function createSynthRibbonPainter(
  context: CanvasRenderingContext2D,
  figure: SynthRibbonFigure,
): (time: number) => void {
  const spine = new Float32Array((SEGMENTS + 1) * SPINE_STRIDE)
  const quads = new Float32Array(RIBBON_COUNT * SEGMENTS * QUAD_STRIDE)
  const order = new Uint16Array(RIBBON_COUNT * SEGMENTS)
  const counts = new Int32Array(DEPTH_BUCKETS)

  return (time) => {
    context.clearRect(0, 0, figure.width, figure.height)
    context.strokeStyle = SPECULAR_STROKE
    let count = 0
    for (const ribbon of RIBBONS) {
      fillSpine(spine, ribbon, time)
      count = collectQuads(quads, spine, figure, ribbon.hue + time * 0.3, count)
    }
    sortByDepth(order, counts, quads, count)
    for (let position = 0; position < count; position++) {
      const slot = readSlot(order, position) * QUAD_STRIDE
      context.globalAlpha = readNumber(quads, slot + 9)
      context.fillStyle = readFill(PALETTE, readNumber(quads, slot + 10))
      drawQuad(context, quads, slot)
      drawSpecular(context, quads, slot)
    }
    context.globalAlpha = 1
  }
}
