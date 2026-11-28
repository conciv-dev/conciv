import {Effect} from 'effect'
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
import {pick, type Pairs} from '../model/pairs.js'
import {writePng, type Pixels} from '../raster/raster.js'
import {gradientPixels, modulated, solidPixels} from './fill-paint.js'
import {decodedFill, fitted, loadPhoton, tiled, type Photon} from './fill-image.js'

type Layer = z.infer<typeof figmaSchemas.layer>
type Blend = typeof normal
type Size = {width: number; height: number}

export const ASSET_SCALE = 2

const CHANNELS = 4
const OPAQUE = 255
const BLENDS: Pairs<Blend> = [
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
]
const SCALES: Pairs<'cover' | 'contain' | 'fill'> = [
  ['FILL', 'cover'],
  ['FIT', 'contain'],
  ['STRETCH', 'fill'],
]
const FILTERS: readonly string[] = ['saturation', 'exposure']
const GRADIENTS: readonly string[] = ['linear-gradient', 'radial-gradient']

export const flattenStack = Effect.fn('design.flattenStack')(function* (input: {
  id: string
  layers: Layer[]
  images: Readonly<Record<string, Uint8Array>>
  box: {w: number; h: number}
  backdrop: string | null
}) {
  const size = {
    width: Math.max(1, Math.round(input.box.w * ASSET_SCALE)),
    height: Math.max(1, Math.round(input.box.h * ASSET_SCALE)),
  }
  const photon = yield* loadPhoton
  const base = input.backdrop === null ? transparent(size) : solidPixels({...size, color: input.backdrop})
  const pixels = yield* Effect.reduce(
    input.layers,
    () => base,
    (below, layer) =>
      drawnLayer({id: input.id, layer, images: input.images, size, photon}).pipe(
        Effect.map((drawn) => (drawn === null ? below : blended({below, drawn, layer}))),
      ),
  )
  return {png: writePng(pixels), notes: input.layers.flatMap((layer) => layerNotes({id: input.id, layer}))}
})

const drawnLayer = Effect.fn('design.drawnLayer')(function* (input: {
  id: string
  layer: Layer
  images: Readonly<Record<string, Uint8Array>>
  size: Size
  photon: Photon
}) {
  const {id, layer, size, photon} = input
  if (layer.type === 'solid') return solidPixels({...size, color: layer.color ?? null})
  if (GRADIENTS.includes(layer.type)) return gradientPixels({...size, layer})
  const bytes = layer.ref === undefined ? undefined : input.images[layer.ref]
  if (layer.type !== 'image' || bytes === undefined) return null
  const decoded = yield* decodedFill({photon, bytes, node: id})
  const filtered =
    layer.filters === undefined
      ? decoded
      : modulated({
          pixels: decoded,
          saturation: 1 + (layer.filters.saturation ?? 0),
          brightness: 1 + (layer.filters.exposure ?? 0),
        })
  if (layer.scale === 'TILE')
    return tiled({photon, pixels: filtered, width: filtered.width * (layer.scalingFactor ?? 1) * ASSET_SCALE, size})
  return fitted({photon, pixels: filtered, fit: pick(SCALES, layer.scale ?? 'FILL') ?? 'cover', size})
})

function transparent(size: Size): Pixels {
  return {...size, data: new Uint8Array(size.width * size.height * CHANNELS)}
}

function blended(input: {below: Pixels; drawn: Pixels; layer: Layer}): Pixels {
  const {below, drawn, layer} = input
  const blend = pick(BLENDS, layer.blend) ?? normal
  const data = new Uint8Array(below.data.length)
  range(0, below.data.length, CHANNELS).forEach((index) => {
    const source = rgbaAt({data: drawn.data, index})
    const mixed = blend(rgbaAt({data: below.data, index}), {...source, a: source.a * layer.opacity})
    data.set(
      [mixed.r, mixed.g, mixed.b, mixed.a * OPAQUE].map((channel) =>
        Math.min(OPAQUE, Math.max(0, Math.round(channel))),
      ),
      index,
    )
  })
  return {width: below.width, height: below.height, data}
}

function rgbaAt(input: {data: Uint8Array; index: number}): {r: number; g: number; b: number; a: number} {
  const {data, index} = input
  return {
    r: data[index] ?? 0,
    g: data[index + 1] ?? 0,
    b: data[index + 2] ?? 0,
    a: (data[index + 3] ?? 0) / OPAQUE,
  }
}

function layerNotes(input: {id: string; layer: Layer}): string[] {
  const {id, layer} = input
  const blend = pick(BLENDS, layer.blend) === undefined ? [`blend ${layer.blend} drawn as normal`] : []
  const scale =
    layer.scale === undefined || layer.scale === 'TILE' || pick(SCALES, layer.scale) !== undefined
      ? []
      : [`scale ${layer.scale} drawn as cover`]
  const filters = Object.keys(layer.filters ?? {})
    .filter((name) => !FILTERS.includes(name))
    .map((name) => `filter ${name} left out`)
  const shape =
    layer.type === 'image' || layer.type === 'solid' || GRADIENTS.includes(layer.type) ? [] : [`${layer.type} left out`]
  return [...blend, ...scale, ...filters, ...shape].map((note) => `${id} ${note}`)
}
