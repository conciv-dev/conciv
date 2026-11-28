import {converter, interpolate, parse, type Color} from 'culori'
import {range} from 'es-toolkit'
import type {z} from 'zod'
import type {figmaSchemas} from './figma-schema.js'
import type {Pixels} from '../raster/raster.js'

type Layer = z.infer<typeof figmaSchemas.layer>
type Stop = NonNullable<Layer['stops']>[number]
type Point = {x: number; y: number}

const CHANNELS = 4
const OPAQUE = 255
const PERCENT = 100
const SAMPLES = 1024
const START: Point = {x: 0, y: 0}
const END: Point = {x: 0, y: 1}
const toRgb = converter('rgb')
const toLch = converter('lch65')

export function solidPixels(input: {width: number; height: number; color: string | null}): Pixels {
  const {width, height} = input
  const data = new Uint8Array(width * height * CHANNELS)
  const parsed = input.color === null ? undefined : parse(input.color)
  if (parsed === undefined) return {width, height, data}
  const rgba = channels(parsed)
  range(width * height).forEach((index) => data.set(rgba, index * CHANNELS))
  return {width, height, data}
}

export function gradientPixels(input: {width: number; height: number; layer: Layer}): Pixels {
  const {width, height, layer} = input
  const [start = START, end = END] = layer.handles ?? []
  const ramp = colorRamp(layer.stops ?? [])
  const position = layer.type === 'radial-gradient' ? radial({start, end}) : linear({start, end})
  const data = new Uint8Array(width * height * CHANNELS)
  range(width * height).forEach((index) => {
    const x = index % width
    const point = {x: (x + 0.5) / width, y: ((index - x) / width + 0.5) / height}
    const at = Math.round(Math.min(1, Math.max(0, position(point))) * (SAMPLES - 1))
    data.set(ramp[at] ?? [0, 0, 0, 0], index * CHANNELS)
  })
  return {width, height, data}
}

export function modulated(input: {pixels: Pixels; saturation: number; brightness: number}): Pixels {
  const {pixels, saturation, brightness} = input
  const data = new Uint8Array(pixels.data)
  range(pixels.width * pixels.height).forEach((index) => {
    const offset = index * CHANNELS
    const lch = toLch({
      mode: 'rgb',
      r: (pixels.data[offset] ?? 0) / OPAQUE,
      g: (pixels.data[offset + 1] ?? 0) / OPAQUE,
      b: (pixels.data[offset + 2] ?? 0) / OPAQUE,
    })
    const rgb = toRgb({...lch, l: lch.l * brightness, c: lch.c * saturation})
    data.set([rgb.r, rgb.g, rgb.b].map(byte), offset)
  })
  return {width: pixels.width, height: pixels.height, data}
}

function linear(input: {start: Point; end: Point}): (point: Point) => number {
  const {start, end} = input
  const across = {x: end.x - start.x, y: end.y - start.y}
  const length = across.x * across.x + across.y * across.y
  return (point) => (length === 0 ? 0 : ((point.x - start.x) * across.x + (point.y - start.y) * across.y) / length)
}

function radial(input: {start: Point; end: Point}): (point: Point) => number {
  const {start, end} = input
  const radius = Math.hypot(end.x - start.x, end.y - start.y)
  return (point) => (radius === 0 ? 1 : Math.hypot(point.x - start.x, point.y - start.y) / radius)
}

function colorRamp(stops: readonly Stop[]): number[][] {
  const sorted = stops.toSorted((a, b) => a.at - b.at)
  const first = sorted[0]
  const last = sorted.at(-1)
  if (first === undefined || last === undefined) return []
  return range(SAMPLES).map((sample) => {
    const at = (sample / (SAMPLES - 1)) * PERCENT
    const after = sorted.findIndex((stop) => stop.at >= at)
    if (after <= 0) return channels(stopColor(after === 0 ? first : last))
    const below = sorted[after - 1] ?? first
    const above = sorted[after] ?? last
    const span = above.at - below.at
    const mix = interpolate([stopColor(below), stopColor(above)], 'rgb')
    return channels(mix(span === 0 ? 0 : (at - below.at) / span))
  })
}

function stopColor(stop: Stop): Color {
  const parsed = toRgb(parse(stop.color) ?? {mode: 'rgb', r: 0, g: 0, b: 0})
  return {...parsed, alpha: stop.opacity}
}

function channels(value: Color): number[] {
  const rgb = toRgb(value)
  return [byte(rgb.r), byte(rgb.g), byte(rgb.b), byte(rgb.alpha ?? 1)]
}

function byte(value: number): number {
  return Math.min(OPAQUE, Math.max(0, Math.round(value * OPAQUE)))
}
