import {Effect} from 'effect'
import {range} from 'es-toolkit'
import type {Pixels} from '../raster/raster.js'
import type {Pairs} from '../model/pairs.js'
import {designErrors} from '../errors/errors.js'

export type Photon = typeof import('@silvia-odwyer/photon-node')

type PhotonImage = InstanceType<Photon['PhotonImage']>
type Size = {width: number; height: number}

const CHANNELS = 4
const FORMATS: Pairs<readonly number[]> = [
  ['png', [0x89, 0x50, 0x4e, 0x47]],
  ['jpeg', [0xff, 0xd8, 0xff]],
  ['gif', [0x47, 0x49, 0x46, 0x38]],
  ['bmp', [0x42, 0x4d]],
  ['tiff', [0x49, 0x49, 0x2a, 0x00]],
  ['tiff', [0x4d, 0x4d, 0x00, 0x2a]],
]
const BRANDS: Pairs<string> = [
  ['heic', 'heic'],
  ['heix', 'heic'],
  ['mif1', 'heif'],
  ['msf1', 'heif'],
  ['avif', 'avif'],
]
const WEBP = 'webp'
const UNKNOWN = 'an unknown format'

export const loadPhoton = Effect.tryPromise({
  try: (): Promise<Photon> => import('@silvia-odwyer/photon-node'),
  catch: (cause) => designErrors.UNREADABLE({file: '@silvia-odwyer/photon-node', detail: String(cause)}),
})

export function decodedFill(input: {photon: Photon; bytes: Uint8Array; node: string}) {
  const {photon, bytes, node} = input
  return Effect.try({
    try: () => released(photon.PhotonImage.new_from_byteslice(bytes)),
    catch: () => designErrors.FILL_FORMAT({node, format: sniffed(bytes)}),
  })
}

export function fitted(input: {photon: Photon; pixels: Pixels; fit: 'cover' | 'contain' | 'fill'; size: Size}): Pixels {
  const {photon, pixels, fit, size} = input
  if (fit === 'fill') return resized({photon, pixels, size})
  const ratios = [size.width / pixels.width, size.height / pixels.height]
  const scale = fit === 'cover' ? Math.max(...ratios) : Math.min(...ratios)
  const scaled = {
    width: Math.max(1, Math.round(pixels.width * scale)),
    height: Math.max(1, Math.round(pixels.height * scale)),
  }
  const drawn = resized({photon, pixels, size: scaled})
  if (fit === 'cover') return cropped({photon, pixels: drawn, size})
  return padded({photon, pixels: drawn, size})
}

export function tiled(input: {photon: Photon; pixels: Pixels; width: number; size: Size}): Pixels {
  const {photon, pixels, size} = input
  const width = Math.max(1, Math.round(input.width))
  const tile = resized({
    photon,
    pixels,
    size: {width, height: Math.max(1, Math.round((pixels.height * width) / pixels.width))},
  })
  const data = new Uint8Array(size.width * size.height * CHANNELS)
  range(size.height).forEach((y) => {
    const row = (y % tile.height) * tile.width * CHANNELS
    range(0, size.width, tile.width).forEach((x) => {
      const length = Math.min(tile.width, size.width - x) * CHANNELS
      data.set(tile.data.subarray(row, row + length), (y * size.width + x) * CHANNELS)
    })
  })
  return {...size, data}
}

function resized(input: {photon: Photon; pixels: Pixels; size: Size}): Pixels {
  const {photon, pixels, size} = input
  if (pixels.width === size.width && pixels.height === size.height) return pixels
  const source = image({photon, pixels})
  const result = photon.resize(source, size.width, size.height, photon.SamplingFilter.Lanczos3)
  source.free()
  return released(result)
}

function cropped(input: {photon: Photon; pixels: Pixels; size: Size}): Pixels {
  const {photon, pixels, size} = input
  const left = Math.floor((pixels.width - size.width) / 2)
  const top = Math.floor((pixels.height - size.height) / 2)
  const source = image({photon, pixels})
  const result = photon.crop(source, left, top, left + size.width, top + size.height)
  source.free()
  return released(result)
}

function padded(input: {photon: Photon; pixels: Pixels; size: Size}): Pixels {
  const {photon, pixels, size} = input
  const left = Math.floor((size.width - pixels.width) / 2)
  const top = Math.floor((size.height - pixels.height) / 2)
  const sides = [
    {pad: photon.padding_left, by: left},
    {pad: photon.padding_right, by: size.width - pixels.width - left},
    {pad: photon.padding_top, by: top},
    {pad: photon.padding_bottom, by: size.height - pixels.height - top},
  ]
  const result = sides.reduce((current, side) => {
    if (side.by <= 0) return current
    const next = side.pad(current, side.by, new photon.Rgba(0, 0, 0, 0))
    current.free()
    return next
  }, image({photon, pixels}))
  return released(result)
}

function image(input: {photon: Photon; pixels: Pixels}): PhotonImage {
  const {photon, pixels} = input
  return new photon.PhotonImage(pixels.data, pixels.width, pixels.height)
}

function released(source: PhotonImage): Pixels {
  const pixels = {width: source.get_width(), height: source.get_height(), data: source.get_raw_pixels()}
  source.free()
  return pixels
}

function sniffed(bytes: Uint8Array): string {
  const magic = FORMATS.find(([, signature]) => signature.every((value, index) => bytes[index] === value))
  if (magic !== undefined) return magic[0]
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, 12))
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return WEBP
  if (text.slice(4, 8) !== 'ftyp') return UNKNOWN
  return BRANDS.find(([brand]) => brand === text.slice(8, 12))?.[1] ?? UNKNOWN
}
