import sharp, {type Sharp} from 'sharp'
import {
  color,
  colorBurn,
  colorDodge,
  darken,
  difference,
  exclusion,
  hardLight,
  hue,
  lighten,
  luminosity,
  multiply,
  normal,
  overlay,
  saturation,
  screen,
  softLight,
} from 'color-blend'
import {range} from 'es-toolkit'
import type {z} from 'zod'
import type {figmaSchemas} from './figma-schema.js'

export async function flattenStack(input: {
  id: string
  layers: Layer[]
  images: Map<string, Uint8Array>
  box: {w: number; h: number}
  backdrop: string | null
}): Promise<{png: Uint8Array; notes: string[]}> {
  const width = Math.max(1, Math.round(input.box.w * ASSET_SCALE))
  const height = Math.max(1, Math.round(input.box.h * ASSET_SCALE))
  const raw: Raw = {width, height, channels: CHANNELS}
  const background = input.backdrop ?? TRANSPARENT
  const base = await sharp({create: {...raw, background}})
    .raw()
    .toBuffer()
  const pixels = await input.layers.reduce<Promise<Buffer>>(
    async (below, layer) => blended({below: await below, layer, images: input.images, raw}),
    Promise.resolve(base),
  )
  const png = await sharp(pixels, {raw}).png().toBuffer()
  return {png: new Uint8Array(png), notes: input.layers.flatMap((layer) => notesOf({id: input.id, layer}))}
}

type Layer = z.infer<typeof figmaSchemas.layer>
type Raw = {width: number; height: number; channels: typeof CHANNELS}
type PixelBlend = typeof color

const ASSET_SCALE = 2
const CHANNELS = 4
const TRANSPARENT = {r: 0, g: 0, b: 0, alpha: 0}
const BLENDS = new Map<string, PixelBlend>([
  ['NORMAL', normal],
  ['PASS_THROUGH', normal],
  ['MULTIPLY', multiply],
  ['SCREEN', screen],
  ['OVERLAY', overlay],
  ['DARKEN', darken],
  ['LIGHTEN', lighten],
  ['COLOR_DODGE', colorDodge],
  ['COLOR_BURN', colorBurn],
  ['HARD_LIGHT', hardLight],
  ['SOFT_LIGHT', softLight],
  ['DIFFERENCE', difference],
  ['EXCLUSION', exclusion],
  ['HUE', hue],
  ['SATURATION', saturation],
  ['COLOR', color],
  ['LUMINOSITY', luminosity],
])
const SCALES = new Map<string, 'cover' | 'contain' | 'fill'>([
  ['FILL', 'cover'],
  ['FIT', 'contain'],
  ['STRETCH', 'fill'],
])
const FILTERS = new Set(['saturation', 'exposure'])
const GRADIENTS = new Set(['linear-gradient', 'radial-gradient'])

async function blended(input: {
  below: Buffer
  layer: Layer
  images: Map<string, Uint8Array>
  raw: Raw
}): Promise<Buffer> {
  const {below, layer} = input
  const painted = await paintedLayer(input)
  if (painted === null) return below
  return pixelBlend({below, painted, blend: BLENDS.get(layer.blend) ?? normal})
}

async function paintedLayer(input: {layer: Layer; images: Map<string, Uint8Array>; raw: Raw}): Promise<Buffer | null> {
  const {layer, raw} = input
  const drawn = await drawnLayer(input)
  if (drawn === null) return null
  return drawn
    .ensureAlpha()
    .linear([1, 1, 1, layer.opacity], [0, 0, 0, 0])
    .resize(raw.width, raw.height, {fit: 'fill'})
    .raw()
    .toBuffer()
}

async function drawnLayer(input: {layer: Layer; images: Map<string, Uint8Array>; raw: Raw}): Promise<Sharp | null> {
  const {layer, raw} = input
  if (layer.type === 'solid') return sharp({create: {...raw, background: layer.color ?? TRANSPARENT}})
  if (GRADIENTS.has(layer.type)) return sharp(Buffer.from(gradientSvg({layer, raw})))
  const bytes = layer.ref === undefined ? undefined : input.images.get(layer.ref)
  if (layer.type !== 'image' || bytes === undefined) return null
  const {filters} = layer
  const filtered =
    filters === undefined
      ? Buffer.from(bytes)
      : await sharp(bytes)
          .ensureAlpha()
          .modulate({saturation: 1 + (filters.saturation ?? 0), brightness: 1 + (filters.exposure ?? 0)})
          .png()
          .toBuffer()
  if (layer.scale === 'TILE') return tiled({bytes: filtered, factor: layer.scalingFactor ?? 1, raw})
  const fit = SCALES.get(layer.scale ?? 'FILL') ?? 'cover'
  return sharp(filtered).resize(raw.width, raw.height, {fit, background: TRANSPARENT})
}

async function tiled(input: {bytes: Buffer; factor: number; raw: Raw}): Promise<Sharp> {
  const {raw} = input
  const {width = 1} = await sharp(input.bytes).metadata()
  const tile = await sharp(input.bytes)
    .resize(Math.max(1, Math.round(width * input.factor * ASSET_SCALE)))
    .png()
    .toBuffer()
  const sheet = await sharp({create: {...raw, background: TRANSPARENT}})
    .composite([{input: tile, tile: true}])
    .png()
    .toBuffer()
  return sharp(sheet)
}

function gradientSvg(input: {layer: Layer; raw: Raw}): string {
  const {layer, raw} = input
  const [start = {x: 0, y: 0}, end = {x: 0, y: 1}] = layer.handles ?? []
  const stops = (layer.stops ?? [])
    .map((stop) => `<stop offset="${stop.at}%" stop-color="${stop.color}" stop-opacity="${stop.opacity}"/>`)
    .join('')
  const shape =
    layer.type === 'radial-gradient'
      ? `<radialGradient id="g" cx="${start.x}" cy="${start.y}" r="${Math.hypot(end.x - start.x, end.y - start.y)}">${stops}</radialGradient>`
      : `<linearGradient id="g" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}">${stops}</linearGradient>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${raw.width}" height="${raw.height}"><defs>${shape}</defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
}

function pixelBlend(input: {below: Buffer; painted: Buffer; blend: PixelBlend}): Buffer {
  const {below, painted, blend} = input
  const out = Buffer.alloc(below.length)
  for (const index of range(0, below.length, CHANNELS)) {
    const mixed = blend(rgbaAt({pixels: below, index}), rgbaAt({pixels: painted, index}))
    out.set([mixed.r, mixed.g, mixed.b, Math.round(mixed.a * 255)], index)
  }
  return out
}

function rgbaAt(input: {pixels: Buffer; index: number}): {r: number; g: number; b: number; a: number} {
  const {pixels, index} = input
  const [r = 0, g = 0, b = 0, a = 0] = pixels.subarray(index, index + CHANNELS)
  return {r, g, b, a: a / 255}
}

function notesOf(input: {id: string; layer: Layer}): string[] {
  const {id, layer} = input
  const blend = BLENDS.has(layer.blend) ? [] : [`blend ${layer.blend} drawn as normal`]
  const scale =
    layer.scale === undefined || layer.scale === 'TILE' || SCALES.has(layer.scale)
      ? []
      : [`scale ${layer.scale} drawn as cover`]
  const filters = Object.keys(layer.filters ?? {})
    .filter((name) => !FILTERS.has(name))
    .map((name) => `filter ${name} left out`)
  const shape =
    layer.type === 'image' || layer.type === 'solid' || GRADIENTS.has(layer.type) ? [] : [`${layer.type} left out`]
  return [...blend, ...scale, ...filters, ...shape].map((note) => `${id} ${note}`)
}
